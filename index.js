import Ver from "./components/Version.js"
import chalk from "chalk"
import Data from "./components/Data.js"
import { Log_Prefix } from "#yenai.components"
logger.info(chalk.rgb(253, 235, 255)("----ヾ(￣▽￣)Bye~Bye~----"))
logger.info(chalk.rgb(134, 142, 204)(`椰奶插件${Ver.ver}初始化~`))
logger.info(chalk.rgb(253, 235, 255)("-------------------------"))

global.ReplyError = class ReplyError extends Error {
  constructor(message) {
    super(message)
    this.name = "ReplyError"
  }
}
// 加载监听事件
const eventsPath = "./plugins/yenai-plugin/apps/events"
const events = Data.readDirRecursive(eventsPath, "js")
Promise.all(events.map(async file => {
  logger.debug(`${Log_Prefix} 加载监听事件：${file}`)
  return import(`./apps/events/${file}`).catch(e => {
    logger.error(`${Log_Prefix} 监听事件错误：${file}`)
    logger.error(e)
  })
})).catch(err => logger.error(err))

const appsPath = "./plugins/yenai-plugin/apps"
const jsFiles = Data.readDirRecursive(appsPath, "js", "events")

let ret = jsFiles.map(file => {
  return import(`./apps/${file}`)
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in jsFiles) {
  let name = jsFiles[i].replace(".js", "")

  if (ret[i].status != "fulfilled") {
    handleError(name, ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

export { apps }

function handleError(name, err) {
  if (err.message.includes("Cannot find package")) {
    const pack = err.message.match(/'(.+?)'/g)[0].replace(/'/g, "")
    logger.warn(`${Log_Prefix} ${logger.yellow(name)} 缺少依赖: ${logger.red(pack)}`)
    logger.warn(`${Log_Prefix} 首次安装请运行 ${logger.red("pnpm i")} 安装依赖`)
    logger.warn(`${Log_Prefix} 如仍然报错 ${logger.red("进入椰奶插件目录")} 使用 ${logger.red(`pnpm add ${pack} -w`)} 进行安装`)
    logger.debug(err.stack)
  } else {
    logger.error(`${Log_Prefix} 载入插件错误：${logger.red(name)}`)
    logger.error(decodeURI(err.stack))
  }
}
