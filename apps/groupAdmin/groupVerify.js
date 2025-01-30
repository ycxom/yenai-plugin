import { Config } from "../../components/index.js"
import { common, GroupAdmin as Ga } from "../../model/index.js"
import _ from "lodash"
import { sleep } from "../../tools/index.js"
// 全局
let temp = {}
const ops = [ "+", "-" ]
export class GroupVerify extends plugin {
  constructor() {
    super({
      name: "椰奶群管-入群验证",
      event: "message.group",
      priority: 5,
      rule: [
        {
          reg: "^#重新验证(\\d+|从未发言的人)?$",
          fnc: "cmdReverify"
        },
        {
          reg: "^#绕过验证(\\d+)?$",
          fnc: "cmdPass"
        },
        {
          reg: "^#(开启|关闭)验证$",
          fnc: "handelverify"
        },
        {
          reg: "^#切换验证模式$",
          fnc: "setmode"
        },
        {
          reg: "^#设置验证超时时间(\\d+)(s|秒)?$",
          fnc: "setovertime"
        }
      ]
    })
    this.verifycfg = Config.groupAdmin.groupVerify
  }

  // 重新验证
  async cmdReverify(e) {
    if (!common.checkPermission(e, "admin", "admin")) return

    if (!this.verifycfg.openGroup.includes(e.group_id)) return e.reply("当前群未开启验证哦~", true)

    let qq = e.message.find(item => item.type == "at")?.qq
    if (!qq) qq = e.msg.replace(/#|重新验证/g, "").trim()

    if (qq == "从未发言的人") return this.cmdReverifyNeverSpeak(e)

    qq = Number(qq) || String(qq)
    if (qq == (e.bot ?? Bot).uin) return

    let info = e.group.pickMember(qq).info
    if (!info) return e.reply("❎ 目标群成员不存在")
    if (info.role === "owner" || info.role === "admin") return e.reply("❎ 该命令对群主或管理员无效")

    if (Config.masterQQ.includes(qq)) return e.reply("❎ 该命令对机器人主人无效")

    if (temp[`${e.group_id}:${qq}`]) return e.reply("❎ 目标群成员处于验证状态")

    await verify(qq, e.group_id, e)
  }

  // 绕过验证
  async cmdPass(e) {
    if (!common.checkPermission(e, "admin", "admin")) return

    if (!this.verifycfg.openGroup.includes(e.group_id)) return e.reply("当前群未开启验证哦~", true)

    let qq = e.message.find(item => item.type == "at")?.qq
    if (!qq) qq = e.msg.replace(/#|绕过验证/g, "").trim()

    if (!(/\d{5,}/.test(qq))) return e.reply("❎ 请输入正确的QQ号")

    if (qq == (e.bot ?? Bot).uin) return
    qq = Number(qq) || String(qq)
    if (!temp[`${e.group_id}:${qq}`]) return e.reply("❎ 目标群成员当前无需验证")

    clearTimeout(temp[`${e.group_id}:${qq}`].kickTimer)

    clearTimeout(temp[`${e.group_id}:${qq}`].remindTimer)

    delete temp[`${e.group_id}:${qq}`]

    return await e.reply(this.verifycfg.SuccessMsgs[e.group_id] || this.verifycfg.SuccessMsgs[0] || "✅ 验证成功，欢迎入群")
  }

  async cmdReverifyNeverSpeak(e) {
    let list = null
    try {
      list = await new Ga(e).getNeverSpeak(e.group_id)
    } catch (error) {
      return common.handleException(e, error)
    }
    for (let item of list) {
      await verify(item.user_id, e.group_id, e)
      await sleep(2000)
    }
  }

  // 开启验证
  async handelverify(e) {
    if (!common.checkPermission(e, "admin", "admin")) return
    let type = /开启/.test(e.msg) ? "add" : "del"
    let isopen = this.verifycfg.openGroup.includes(e.group_id)
    if (isopen && type == "add") return e.reply("❎ 本群验证已处于开启状态")
    if (!isopen && type == "del") return e.reply("❎ 本群暂未开启验证")
    Config.modifyArr("groupAdmin", "groupVerify.openGroup", e.group_id, type)
    e.reply(`✅ 已${type == "add" ? "开启" : "关闭"}本群验证`)
  }

  // 切换验证模式
  async setmode(e) {
    if (!common.checkPermission(e, "master")) return
    let value = this.verifycfg.mode == "模糊" ? "精确" : "模糊"
    Config.modify("groupAdmin", "groupVerify.mode", value)
    e.reply(`✅ 已切换验证模式为${value}验证`)
  }

  // 设置验证超时时间
  async setovertime(e) {
    if (!common.checkPermission(e, "master")) return
    let overtime = e.msg.match(/\d+/g)
    Config.modify("groupAdmin", "groupVerify.time", Number(overtime))
    e.reply(`✅ 已将验证超时时间设置为${overtime}秒`)
    if (overtime < 60) {
      e.reply("建议至少一分钟(60秒)哦ε(*´･ω･)з")
    }
  }
}

// 进群监听
Bot.on?.("notice.group.increase", async(e) => {
  let { openGroup, DelayTime } = Config.groupAdmin.groupVerify
  if (!openGroup.includes(e.group_id)) return
  logger.mark(`[Yenai-Plugin][进群验证]收到${e.user_id}的进群事件`)
  if (!e.group.is_admin && !e.group.is_owner) return
  if (e.user_id == (e.bot ?? Bot).uin) return
  if (Config.masterQQ.includes(e.user_id)) return
  if (Config.groupAdmin.whiteQQ.includes(e.user_id)) return

  await sleep(DelayTime * 1000)
  await verify(e.user_id, e.group_id, e)
})

// 答案监听
Bot.on?.("message.group", async(e) => {
  let { openGroup, mode, SuccessMsgs } = Config.groupAdmin.groupVerify

  if (!openGroup.includes(e.group_id)) return

  if (!e.group.is_admin && !e.group.is_owner) return

  if (!temp[`${e.group_id}:${e.user_id}`]) return

  const { verifyCode, kickTimer, remindTimer } = temp[`${e.group_id}:${e.user_id}`]

  const { nums, operator } = temp[`${e.group_id}:${e.user_id}`]

  const isAccurateModeOK = mode === "精确" && e.raw_message == verifyCode

  const isVagueModeOK = mode === "模糊" && e.raw_message?.includes(verifyCode)

  const isOK = isAccurateModeOK || isVagueModeOK

  if (isOK) {
    delete temp[`${e.group_id}:${e.user_id}`]
    clearTimeout(kickTimer)
    clearTimeout(remindTimer)
    return await sendMsg(e, SuccessMsgs[e.group_id] || SuccessMsgs[0] || "✅ 验证成功，欢迎入群")
  } else {
    temp[`${e.group_id}:${e.user_id}`].remainTimes -= 1

    const { remainTimes } = temp[`${e.group_id}:${e.user_id}`]

    if (remainTimes > 0) {
      await e.group.recallMsg(e)

      const msg = `\n❎ 验证失败\n你还有「${remainTimes}」次机会\n请发送「${nums[0]} ${operator} ${nums[1]}」的运算结果`
      return await sendMsg(e, [ segment.at(e.user_id), msg ])
    }
    clearTimeout(kickTimer)
    clearTimeout(remindTimer)
    await sendMsg(e, [ segment.at(e.user_id), "\n验证失败，请重新申请" ])
    delete temp[`${e.group_id}:${e.user_id}`]
    return await e.group.kickMember(e.user_id)
  }
})

// 主动退群
Bot.on?.("notice.group.decrease", async(e) => {
  if (!e.group.is_admin && !e.group.is_owner) return

  if (!temp[`${e.group_id}:${e.user_id}`]) return

  clearTimeout(temp[`${e.group_id}:${e.user_id}`].kickTimer)

  clearTimeout(temp[`${e.group_id}:${e.user_id}`].remindTimer)

  delete temp[`${e.group_id}:${e.user_id}`]

  sendMsg(e, `「${e.user_id}」主动退群，验证流程结束`)
})

/**
 * 进行验证
 * @param userId 用户QQ号
 * @param groupId 群号
 * @param e 消息事件
 */
async function verify(userId, groupId, e) {
  if (!e.group.is_admin && !e.group.is_owner) return
  userId = Number(userId)
  groupId = Number(groupId)
  logger.mark(`[Yenai-Plugin][进群验证]进行${userId}的验证`)

  const { times, range, time, remindAtLastMinute } = Config.groupAdmin.groupVerify
  const operator = ops[_.random(0, 1)]

  let [ m, n ] = [ _.random(range.min, range.max), _.random(range.min, range.max) ]
  while (m == n) {
    n = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min
  }

  [ m, n ] = [ m >= n ? m : n, m >= n ? n : m ]

  const verifyCode = String(operator === "-" ? m - n : m + n)
  logger.mark(`[Yenai-Plugin][进群验证]答案：${verifyCode}`)
  const kickTimer = setTimeout(async() => {
    sendMsg(e, [ segment.at(userId), "\n验证超时，移出群聊，请重新申请" ])

    delete temp[`${groupId}:${userId}`]

    clearTimeout(kickTimer)

    return await e.group.kickMember(userId)
  }, time * 1000)

  const shouldRemind = remindAtLastMinute && time >= 120

  const remindTimer = setTimeout(async() => {
    if (shouldRemind && temp[`${groupId}:${userId}`].remindTimer) {
      const msg = ` \n验证仅剩最后一分钟\n请发送「${m} ${operator} ${n}」的运算结果\n否则将会被移出群聊`

      await sendMsg(e, [ segment.at(userId), msg ])
    }
    clearTimeout(remindTimer)
  }, Math.abs(time * 1000 - 60000))

  const msg = ` 欢迎！\n请在「${time}」秒内发送\n「${m} ${operator} ${n}」的运算结果\n否则将会被移出群聊`

  // 消息发送成功才写入
  if (await sendMsg(e, [ segment.at(userId), msg ])) {
    temp[`${groupId}:${userId}`] = {
      remainTimes: times,
      nums: [ m, n ],
      operator,
      verifyCode,
      kickTimer,
      remindTimer
    }
  } else {
    // 删除定时器
    clearTimeout(remindTimer)
    clearTimeout(kickTimer)
  }
}
async function sendMsg(e, msg) {
  const sendMsgFunctions = {
    reply: async() => e.reply(msg),
    group: async() => e.group.sendMsg(msg),
    bot: async() => e.bot.pinkGroup(e.group_id).sendMsg(msg),
    self_id: async() => Bot[e.self_id].pinkGroup(e.group_id).sendMsg(msg)
  }

  for (const key in sendMsgFunctions) {
    if (e[key]) {
      try {
        const sendFunction = sendMsgFunctions[key]
        let res = await sendFunction()
        return res
      } catch (error) {
        logger.debug(`[Yenai-Plugin][进群验证]发送消息失败: ${error.message}`)
      }
    }
  }

  throw Error("[Yenai-Plugin][进群验证]未获取到发送消息函数")
}
