import core, { API, FileInfo } from "jscodeshift"

const paths = {
  "@actor": ["src/module/actor/index.ts"],
  "@actor/*": ["src/module/actor/*"],
  "@item": ["src/module/item/index.ts"],
  "@item/*": ["src/module/item/*"],
  "@scene": ["src/module/scene/index.ts"],
  "@scene/*": ["src/module/scene/*"],
  "@system/*": ["src/module/system/*"],
  "@module/*": ["src/module/*"],
  "@scripts/*": ["src/scripts/*"],
  "@util": ["src/util/index.ts"],
  "@util/*": ["src/util/*"],
}

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = j(file.source)

  root.find(j.ImportDeclaration).forEach((node) => {
    const value = node.value.source.value
    if (typeof value !== "string") return
    if (!value.startsWith("@")) return

    const match = value.match(/^@(\w+)(.+)?$/m)
    if (!match) return
    const [_, name, rest] = match
    if (!Object.keys(paths).includes(`@${name}/*`)) {
      console.log("Skipping " + match?.[1])
      return
    }

    if (rest) {
      const start = paths[`@${name}/*`][0].slice(0, -2)
      node.value.source.value = start + rest
    } else node.value.source.value = paths[`@${name}`][0]
  })
  return root.toSource()
}
