import { common } from "../../model/index.js"
import { sleep } from "../../tools/index.js"

let FriendsReg = /^#发好友\s?(\d+)\s?([^]*)$/
let GroupMsgReg = /^#发群聊\s?(\d+)\s?([^]*)$/
let GroupListMsgReg = /^#发群列表\s?(\d+(,\d+){0,})\s?([^]*)$/

export class SendMsg extends plugin {
  constructor() {
    super({
      name: "椰奶助手-发消息",
      event: "message",
      priority: 500,
      rule: [
        {
          reg: FriendsReg, // 发好友
          fnc: "SendFriendMsg"
        },
        {
          reg: GroupMsgReg, // 发群聊
          fnc: "SendGroupMsg"
        },
        {
          reg: GroupListMsgReg, // 发群列表
          fnc: "SendGroupListMsg"
        }
      ]
    })
  }

  get Bot() {
    return this.e.bot ?? Bot
  }

  /**
   * 发好友
   * @param e
   */
  async SendFriendMsg(e) {
    if (!common.checkPermission(e, "master")) return
    let regRet = FriendsReg.exec(e.msg)
    let qq = regRet[1]
    e.message[0].text = regRet[2]
    if (!/^\d+$/.test(qq)) return e.reply("❎ QQ号不正确，人家做不到的啦>_<~")

    if (!this.Bot.fl.get(Number(qq))) return e.reply("❎ 好友列表查无此人")

    if (!e.message[0].text) e.message.shift()

    if (e.message.length === 0) return e.reply("❎ 消息不能为空")

    await this.Bot.pickFriend(qq).sendMsg(e.message)
      .then(() => e.reply("✅ 私聊消息已送达"))
      .catch(err => common.handleException(e, err, { MsgTemplate: "❎ 发送失败\n错误信息为:{error}" }))
  }

  /**
   * 发群聊
   * @param e
   */
  async SendGroupMsg(e) {
    if (!common.checkPermission(e, "master")) return
    let regRet = GroupMsgReg.exec(e.msg)

    let gpid = regRet[1]

    e.message[0].text = regRet[2]

    if (!e.message[0].text) e.message.shift()

    if (e.message.length === 0) return e.reply("❎ 消息不能为空")

    if (!/^\d+$/.test(gpid)) return e.reply("❎ 您输入的群号不合法")

    if (!this.Bot.gl.get(Number(gpid))) return e.reply("❎ 群聊列表查无此群")

    await this.Bot.pickGroup(gpid).sendMsg(e.message)
      .then(() => e.reply("✅ 群聊消息已送达"))
      .catch((err) => common.handleException(e, err, { MsgTemplate: "❎ 发送失败\n错误信息为:{error}" }))
  }

  // 发送群列表
  async SendGroupListMsg(e) {
    if (!common.checkPermission(e, "master")) return
    // 获取参数
    let regRet = GroupListMsgReg.exec(e.msg)
    let gpid = regRet[1]
    e.message[0].text = regRet[3]

    if (!e.message[0].text) e.message.shift()

    if (e.message.length === 0) return e.reply("❎ 消息不能为空")

    let groupidList = []
    let sendList = []

    // 获取群列表
    let listMap = Array.from(this.Bot.gl.values())

    listMap.forEach((item) => {
      groupidList.push(item.group_id)
    })

    let groupids = gpid.split(",")

    if (!groupids.every(item => item <= groupidList.length)) return e.reply("❎ 序号超过合法值！！！")

    groupids.forEach((item) => {
      sendList.push(groupidList[Number(item) - 1])
    })

    if (sendList.length > 3) return e.reply("❎ 不能同时发太多群聊，号寄概率增加！！！")

    if (sendList.length === 1) {
      await this.Bot.pickGroup(sendList[0]).sendMsg(e.message)
        .then(() => e.reply("✅ " + sendList[0] + " 群聊消息已送达"))
        .catch((err) =>
          common.handleException(e, err, { MsgTemplate: `❎ ${sendList[0]} 发送失败\n错误信息为:{error}` })
        )
    } else {
      e.reply("发送多个群聊，将每5秒发送一条消息！")
      for (let i of sendList) {
        await this.Bot.pickGroup(i).sendMsg(e.message)
          .then(() => e.reply("✅ " + i + " 群聊消息已送达"))
          .catch((err) =>
            common.handleException(e, err, { MsgTemplate: `❎ ${i} 发送失败\n错误信息为:{error}` }))
        await sleep(5000)
      }
    }
    return false
  }
}
