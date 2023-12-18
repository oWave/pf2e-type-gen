import { Octokit } from "@octokit/rest"
import decompress from "decompress"
import fr from "follow-redirects"
import fs from "fs"
import { confirm } from "@inquirer/prompts"
import { spawn, spawnSync } from "child_process"

const octokit = new Octokit()

async function fetchReleases() {
  return octokit.rest.repos.listReleases({ owner: "foundryvtt", repo: "pf2e" })
}

async function download(tag: string) {
  const file = fs.createWriteStream(`./cache/${tag}.tar.gz`)

  return new Promise<void>((resolve) => {
    const request = fr.https.get(
      `https://github.com/foundryvtt/pf2e/archive/refs/tags/${tag}.tar.gz`,
      function (response) {
        console.log("Downloading release")
        response.pipe(file)
        file.on("finish", () => {
          file.close()
          resolve()
        })
      }
    )
  })
}

async function extract(tag: string) {
  console.log("Extracting")
  return decompress(`./cache/${tag}.tar.gz`, "./repo", {
    filter: (f) => {
      const parts = f.path.split("/").slice(1)
      const isDir = parts.length > 1
      const dir = isDir ? f.path.split("/")[0] : null

      if (isDir && parts?.at(1) == "lang") return true
      if (isDir && !["src", "types"].includes(parts[0])) return false
      return true
    },
    map: (f) => {
      f.path = f.path.split("/").slice(1).join("/")
      return f
    },
  })
}

async function downloadAndExtract(tag: string) {
  if (!fs.existsSync(`./cache/${tag}.tar.gz`)) await download(tag)
  clean()
  await extract(tag)
}

function clean() {
  if (fs.existsSync("./repo")) fs.rmSync("./repo", { recursive: true })
  fs.mkdirSync("./repo")
}

if (!fs.existsSync("cache")) fs.mkdirSync("cache")

const arg = process.argv.at(2)?.toLowerCase()

let tag: string | null = null
if (arg == "latest" || !arg) {
  const releases = await fetchReleases()
  tag = releases.data[0].tag_name
  console.log(`Using latest tag ${tag}`)
} else {
  tag = arg
}
if (!arg) {
  if (
    !(await confirm({
      message: `Continue?`,
    }))
  )
    process.exit(1)
}

await downloadAndExtract(tag)

let res = spawnSync("npm", ["ci"], {
  shell: true,
  stdio: "inherit",
  cwd: "./repo",
})

if (res.error) throw res.error

res = spawnSync(
  ".\\node_modules\\.bin\\jscodeshift",
  [
    "--extensions=ts",
    "--parser=ts",
    "-t",
    "tsconfig-replace-paths.ts",
    "./repo/src",
  ],
  {
    shell: true,
    stdio: "inherit",
  }
)

if (res.error) throw res.error

res = spawnSync(
  "..\\node_modules\\.bin\\tsc",
  [
    "--declaration",
    "true",
    "--emitDeclarationOnly",
    "true",
    "--noemit",
    "false",
    "--outdir",
    "dist/types",
    "--newLine",
    "lf",
  ],
  {
    shell: true,
    stdio: "inherit",
    cwd: "./repo",
  }
)

if (res.error) throw res.error

if (fs.existsSync("./out")) fs.rmSync("./out", { recursive: true })
fs.mkdirSync("./out/pf2e", { recursive: true })
fs.renameSync("./repo/dist/types/src/global.d.ts", "./out/pf2e/global.d.ts")
fs.renameSync("./repo/dist/types/src", "./out/pf2e/src")
fs.copyFileSync("./tsconfig-template.json", "./out/pf2e/tsconfig.json")

fs.renameSync("./repo/types/foundry", "./out/foundry")

process.exit(0)
