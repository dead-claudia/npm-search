"use strict"

const blessed = require("blessed")
const libnpmsearch = require("libnpmsearch")

process.on("unhandledRejection", e => { throw e })

const screen = blessed.screen({
    autoPadding: true,
    smartCSR: true,
    ignoreLocked: ["C-c"],
    title: "npm search tool",
})

function quit() {
    // eslint-disable-next-line no-process-exit
    process.exit(0)
}

screen.key(["C-c"], quit)

const consoleEnd = 69

function previewDescription(desc) {
    if (desc == null) return ""
    desc = String(desc).trim()
    const index = desc.indexOf("\n")

    if (index >= 0) desc = desc.slice(0, index)
    return desc.length < consoleEnd
        ? desc
        : `${desc.slice(0, consoleEnd).trim()}...`
}

const scrollWindow = 5
const searchBatchSize = 32

const invertScroll = process.platform === "darwin"

screen.key("up", () => scroll(true))
screen.key("down", () => scroll(false))

function n(factory, {on = {}, ...attrs}, children = []) {
    const node = factory(attrs)

    for (const child of children) node.append(child)
    for (const key of Object.keys(on)) node.on(key, on[key])
    return node
}

const rootStyle = {
    keys: true,
    focused: true,
    left: "2.5%",
    top: "5%",
    width: "95%",
    height: "100%",
}

let index = 0
const searchList = []
let items = []
let limit = searchBatchSize
let timeout

let searchInput, displayList
let backButton, nameBox, descriptionBox

const searchForm = n(blessed.form, rootStyle, [
    n(blessed.box, {
        top: 0,
        height: 3, width: 68,
        border: {type: "line"},
        style: {
            border: {fg: "blue"},
        },
    }, [
        n(blessed.box, {
            left: 1, width: 8,
            height: 1,
            content: "Search:",
        }),
        searchInput = n(blessed.textbox, {
            left: 9,
            height: 1,
            mouse: true,
            inputOnFocus: true,
            on: {keypress: (ch, key) => {
                if (
                    key.name !== "up" &&
                    key.name !== "down" &&
                    key.name !== "escape"
                ) {
                    index = 0
                    limit = searchBatchSize
                    execSearch()
                }
            }},
        }),
    ]),
    n(blessed.button, {
        top: 0, left: 68,
        height: 3, width: 8,
        border: {type: "line"},
        content: " Quit ",
        style: {
            fg: "red",
            hover: {bold: true},
            border: {fg: "red"},
        },
        on: {click: quit},
    }),
    displayList = n(blessed.box, {
        top: 3,
        scrollable: true,
        on: {mouse: listScroll},
    }),
])

const detailsForm = n(blessed.form, rootStyle, [
    backButton = n(blessed.button, {
        top: 0,
        width: 8,
        height: 3,
        border: {type: "line"},
        style: {fg: "yellow", border: {fg: "yellow"}},
        content: " Back ",
        on: {click: renderSearch},
    }),
    n(blessed.box, {
        top: 0, left: 8,
        width: 60,
        height: 3,
        border: {type: "line"},
        style: {border: {fg: "blue"}},
    }, [
        nameBox = n(blessed.box, {
            left: 1,
            style: {
                bold: true,
            },
        }),
    ]),
    n(blessed.box, {
        top: 3,
        height: 20,
        scrollable: true,
        border: {type: "line"},
        style: {border: {fg: "blue"}},
    }, [
        descriptionBox = n(blessed.box, {
            left: 1,
        }),
    ]),
    n(blessed.button, {
        top: 0, left: 68,
        height: 3, width: 8,
        border: {type: "line"},
        content: " Quit ",
        style: {fg: "red", border: {fg: "red"}},
        on: {click: quit},
    }),
])

function execSearch() {
    if (timeout == null) {
        timeout = setTimeout(() => {
            timeout = undefined
        }, 200)
        reallyExecSearch()
    } else {
        clearTimeout(timeout)
        timeout = setTimeout(() => {
            timeout = undefined
            reallyExecSearch()
        }, 200)
    }
}

function reallyExecSearch() {
    libnpmsearch(searchInput.value, {limit}).then(search => {
        items = search

        for (let i = 0; i < items.length; i++) {
            const {name, description: desc} = items[i]

            items[i] = {name, desc}
        }

        if (items.length <= 5) {
            index = 0
        } else if (index >= items.length - scrollWindow) {
            index = items.length - scrollWindow - 1
        }

        renderItems()
    })
}

// Note: pass `true` for `up`, `false` for `down`
function scroll(upDown) {
    if (upDown) {
        index = Math.max(0, index - 1)
    } else {
        index++
        if (items.length === limit && index >= limit - searchBatchSize / 2) {
            limit += searchBatchSize
            execSearch()
            return
        }
        if (items.length <= 5) {
            index = 0
        } else if (index >= items.length - scrollWindow) {
            index = items.length - scrollWindow - 1
        }
    }

    renderItems()
}

let throttle = 0

function listScroll(event) {
    if (event.action === "wheelup" || event.action === "wheeldown") {
        const date = Date.now()

        if (date < throttle) return
        throttle = date + 25
        scroll(invertScroll === (event.action === "wheelup"))
    }
}

function renderSearch() {
    screen.remove(detailsForm)
    screen.append(searchForm)
    screen.render()
}

function renderItems() {
    const sliceLen = Math.min(items.length - index, scrollWindow)
    const min = Math.min(searchList.length, sliceLen)

    for (let i = 0; i < min; i++) {
        const memo = searchList[i]
        const {name, desc} = items[i + index]

        if (memo.name !== name) {
            memo.nameBox.setText(memo.name = name)
        }

        if (memo.desc !== desc) {
            memo.descBox.setText(previewDescription(memo.desc = desc))
        }
    }

    for (let i = min; i < searchList.length; i++) {
        displayList.remove(searchList[i].packageBox)
    }

    for (let i = min; i < sliceLen; i++) {
        const {name, desc} = items[i + index]
        const memo = searchList[i] = {
            name, desc,
            packageBox: undefined,
            nameBox: undefined,
            descBox: undefined,
        }
        const events = {
            mouse: listScroll,
            click: () => {
                screen.remove(searchForm)
                screen.append(detailsForm)
                nameBox.setText(memo.name)
                descriptionBox.setText(memo.desc)
                backButton.focus()
                screen.render()
            },
        }

        displayList.append(
            memo.packageBox = n(blessed.box, {
                top: i * 4,
                height: 4,
                border: {type: "line"},
                style: {
                    border: {fg: "blue"},
                },
                on: events,
            }, [
                memo.nameBox = n(blessed.box, {
                    left: 1,
                    height: 1, content: name,
                    style: {
                        bold: true,
                    },
                    on: events,
                }),
                memo.descBox = n(blessed.box, {
                    top: 1, left: 1,
                    height: 1,
                    content: previewDescription(desc),
                    on: events,
                }),
            ])
        )
    }

    searchList.length = sliceLen
    screen.render()
}

screen.append(searchForm)
screen.render()
