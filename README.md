# 圆桌

一个让用户亲自主持、多 AI 参与讨论并形成透明阶段纪要的会议原型。

## 本地运行

```bash
npm install
```

运行前在项目根目录创建 `.env.local`：

```bash
AI_MEETING_BASE_URL=https://downstream.jbbtoken.cn/v1
AI_MEETING_API_KEY=你的 API Key
```

然后启动：

```bash
npm run dev
```

当前版本通过本地 Vite 代理调用 OpenAI 兼容 API，API Key 不会发送给浏览器。用户提交议题后，多个模型先独立发言；会议会停下来等待用户补充、追问或反对，再由模型针对用户发言回应。只有用户主动点击后才会形成阶段纪要。

当前尚未实现账户系统、持久化存储和生产环境后端。开发代理只适合本地验证，部署前需要实现独立服务端。
