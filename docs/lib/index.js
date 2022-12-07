const localeCompare = require('@isaacs/string-locale-compare')('en')
const { join, basename, resolve } = require('path')
const transformHTML = require('./transform-html.js')
const { version } = require('../../lib/npm.js')
const { aliases } = require('../../lib/utils/cmd-list')
const { shorthands, definitions } = require('../../lib/utils/config/index.js')

const DOC_EXT = '.md'

const TAGS = {
  CONFIG: '<!-- AUTOGENERATED CONFIG DESCRIPTIONS -->',
  USAGE: '<!-- AUTOGENERATED USAGE DESCRIPTIONS -->',
  SHORTHANDS: '<!-- AUTOGENERATED CONFIG SHORTHANDS -->',
}

const assertPlaceholder = (src, path, placeholder) => {
  if (!src.includes(placeholder)) {
    throw new Error(
      `Cannot replace ${placeholder} in ${path} due to missing placeholder`
    )
  }
  return placeholder
}

const getCommandByDoc = (docFile, docExt) => {
  // Grab the command name from the *.md filename
  // NOTE: We cannot use the name property command file because in the case of
  // `npx` the file being used is `lib/commands/exec.js`
  const name = basename(docFile, docExt).replace('npm-', '')

  if (name === 'npm') {
    return {
      name,
      params: null,
      usage: 'npm',
    }
  }

  // special case for `npx`:
  // `npx` is not technically a command in and of itself,
  // so it just needs the usage of npm exex
  const srcName = name === 'npx' ? 'exec' : name
  const { params, usage = [''] } = require(`../../lib/commands/${srcName}`)
  const usagePrefix = name === 'npx' ? 'npx' : `npm ${name}`

  return {
    name,
    params: name === 'npx' ? null : params,
    usage: usage.map(u => `${usagePrefix} ${u}`.trim()).join('\n'),
  }
}

const replaceVersion = (src) => src.replace(/@VERSION@/g, version)

const replaceUsage = (src, { path }) => {
  const replacer = assertPlaceholder(src, path, TAGS.USAGE)
  const { usage, name } = getCommandByDoc(path, DOC_EXT)

  const synopsis = ['```bash', usage]

  const cmdAliases = Object.keys(aliases).reduce((p, c) => {
    if (aliases[c] === name) {
      p.push(c)
    }
    return p
  }, [])

  if (cmdAliases.length === 1) {
    synopsis.push('')
    synopsis.push(`alias: ${cmdAliases[0]}`)
  } else if (cmdAliases.length > 1) {
    synopsis.push('')
    synopsis.push(`aliases: ${cmdAliases.join(', ')}`)
  }

  synopsis.push('```')

  return src.replace(replacer, synopsis.join('\n'))
}

const replaceParams = (src, { path }) => {
  const { params } = getCommandByDoc(path, DOC_EXT)
  const replacer = params && assertPlaceholder(src, path, TAGS.CONFIG)

  if (!params) {
    return src
  }

  const paramsConfig = params.map((n) => definitions[n].describe())

  return src.replace(replacer, paramsConfig.join('\n\n'))
}

const replaceConfig = (src, { path }) => {
  const replacer = assertPlaceholder(src, path, TAGS.CONFIG)

  // sort not-deprecated ones to the top
  /* istanbul ignore next - typically already sorted in the definitions file,
   * but this is here so that our help doc will stay consistent if we decide
   * to move them around. */
  const sort = ([keya, { deprecated: depa }], [keyb, { deprecated: depb }]) => {
    return depa && !depb ? 1
      : !depa && depb ? -1
      : localeCompare(keya, keyb)
  }

  const allConfig = Object.entries(definitions).sort(sort)
    .map(([_, def]) => def.describe())
    .join('\n\n')

  return src.replace(replacer, allConfig)
}

const replaceShorthands = (src, { path }) => {
  const replacer = assertPlaceholder(src, path, TAGS.SHORTHANDS)

  const sh = Object.entries(shorthands)
    .sort(([shorta, expansiona], [shortb, expansionb]) =>
      // sort by what they're short FOR
      localeCompare(expansiona.join(' '), expansionb.join(' ')) || localeCompare(shorta, shortb)
    )
    .map(([short, expansion]) => {
      // XXX: this is incorrect. we have multicharacter flags like `-iwr` that
      // can only be set with a single dash
      const dash = short.length === 1 ? '-' : '--'
      return `* \`${dash}${short}\`: \`${expansion.join(' ')}\``
    })

  return src.replace(replacer, sh.join('\n'))
}

const replaceHelpLinks = (src) => {
  // replaces markdown links with equivalent-ish npm help commands
  return src.replace(
    /\[`?([\w\s-]+)`?\]\(\/(?:commands|configuring-npm|using-npm)\/(?:[\w\s-]+)\)/g,
    (_, p1) => {
      const term = p1.replace(/npm\s/g, '').replace(/\s+/g, ' ').trim()
      const help = `npm help ${term.includes(' ') ? `"${term}"` : term}`
      return help
    }
  )
}

const transformMan = (src, { data, unified, remarkParse, remarkMan }) => unified()
  .use(remarkParse)
  .use(remarkMan)
  .processSync(`# ${data.title}(${data.section}) - ${data.description}\n\n${src}`)
  .toString()

const manPath = (name, { data }) => join(`man${data.section}`, `${name}.${data.section}`)

const transformMd = (src, { frontmatter }) => ['---', frontmatter, '---', '', src].join('\n')

module.exports = {
  DOC_EXT,
  TAGS,
  paths: {
    content: resolve(__dirname, 'content'),
    nav: resolve(__dirname, 'content', 'nav.yml'),
    template: resolve(__dirname, 'template.html'),
    man: resolve(__dirname, '..', '..', 'man'),
    html: resolve(__dirname, '..', 'output'),
    md: resolve(__dirname, '..', 'content'),
  },
  usage: replaceUsage,
  params: replaceParams,
  config: replaceConfig,
  shorthands: replaceShorthands,
  version: replaceVersion,
  helpLinks: replaceHelpLinks,
  man: transformMan,
  manPath: manPath,
  md: transformMd,
  html: transformHTML,
}