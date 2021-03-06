/* eslint-disable no-fallthrough */
const Scanner = require('./Scanner')
const {
    MessageEntityBold, MessageEntityItalic, MessageEntityCode,
    MessageEntityPre, MessageEntityTextUrl, MessageEntityMentionName,
    MessageEntityStrike,
} = require('../tl/types')
const { regExpEscape } = require('../Helpers')

const URL_RE = /\[([\S\s]+?)\]\((.+?)\)/
const DELIMITERS = {
    'MessageEntityBold': '**',
    'MessageEntityItalic': '__',
    'MessageEntityCode': '`',
    'MessageEntityPre': '```',
    'MessageEntityStrike': '~~',
}

class MarkdownParser extends Scanner {
    constructor(str) {
        super(str)
        this.text = ''
        this.entities = []
    }

    parse() {
        // Do a little reset
        this.text = ''
        this.entities = []

        while (!this.eof()) {
            switch (this.chr) {
            case '*':
                if (this.peek(2) == '**') {
                    if (this.parseEntity(MessageEntityBold, '**')) break
                }
            case '_':
                if (this.peek(2) == '__') {
                    if (this.parseEntity(MessageEntityItalic, '__')) break
                }
            case '~':
                if (this.peek(2) == '~~') {
                    if (this.parseEntity(MessageEntityStrike, '~~')) break
                }
            case '`':
                if (this.peek(3) == '```') {
                    if (this.parseEntity(MessageEntityPre, '```')) break
                } else if (this.peek(1) == '`') {
                    if (this.parseEntity(MessageEntityCode, '`')) break
                }
            case '[':
                if (this.parseURL()) break
            default:
                this.text += this.chr
                this.pos += 1
            }
        }

        return [this.text, this.entities]
    }

    static unparse(text, entities) {
        if (!text || !entities) return text
        entities = Array.isArray(entities) ? entities : [entities]

        let insertAt = []
        for (const entity of entities) {
            const s = entity.offset
            const e = entity.offset + entity.length
            const delimiter = DELIMITERS[entity.constructor.name]
            if (delimiter) {
                insertAt.push([s, delimiter])
                insertAt.push([e, delimiter])
            } else {
                let url = null
                if (entity instanceof MessageEntityTextUrl) {
                    url = entity.url
                } else if (entity instanceof MessageEntityMentionName) {
                    url = `tg://user?id=${entity.userId}`
                }

                if (url) {
                    insertAt.push([s, '['])
                    insertAt.push([e, `](${url})`])
                }
            }
        }

        insertAt = insertAt.sort((a, b) => a[0] - b[0])
        while (insertAt.length > 0) {
            let [at, what] = insertAt.pop()

            while ((at < text.length) && '\ud800' <= text[at] && text[at] <= '\udfff') {
                at += 1
            }

            text = text.slice(0, at) + what + text.slice(at, text.size)
        }

        return text
    }

    parseEntity(EntityType, delimiter) {
        // The offset for this entity should be the end of the
        // text string
        const offset = this.text.length

        // Consume the delimiter
        this.consume(delimiter.length)

        // Scan until the delimiter is reached again. This is the
        // entity's content.
        const content = this.scanUntil(new RegExp(regExpEscape(delimiter)))

        if (content) {
            // Consume the delimiter again
            this.consume(delimiter.length)

            // Add the entire content to the text
            this.text += content

            // Create and return a new Entity
            const entity = new EntityType({
                offset,
                length: content.length,
            })
            this.entities.push(entity)
            return entity
        }
    }

    parseURL() {
        const match = this.rest.match(URL_RE)
        if (match.index !== 0) return

        const [full, txt, url] = match
        const len = full.length
        const offset = this.text.length

        this.text += txt

        const entity = new MessageEntityTextUrl({
            offset: offset,
            length: txt.length,
            url: url,
        })

        this.consume(len)
        this.entities.push(entity)

        return entity
    }
}

const parse = (str) => {
    const parser = new MarkdownParser(str)
    return parser.parse()
}

const unparse = MarkdownParser.unparse

module.exports = {
    MarkdownParser,
    parse,
    unparse,
}
