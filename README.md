# AI-Image-Edit - AI图片生成编辑

[![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](./VERSION)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/hugohe3/ppt-master.svg)](https://github.com/hugohe3/ppt-master/stargazers)

[English](./README_EN.md) | 中文

一个简约的AI图片生成编辑网站，通过画笔涂抹或框选图片局部区域进行编辑修改，可一次性修改多个区域。

对复杂图形有概率会修改到原图其他元素

## 🚀 快速使用指南
> 💡 **AI 生成图片注意**：支持各种绘图模型，需要模型支持通用OpenAI API格式，编辑的话也是一样。

```
1️⃣ 克隆仓库
   git clone https://github.com/chunxiuxiamo/ai-image-edit.git

```

### 代表作品展示
<img width="1920" height="919" alt="image" src="https://github.com/user-attachments/assets/ece324f0-573d-452e-a976-afdb326e8de4" />
<img width="1920" height="1288" alt="image" src="https://github.com/user-attachments/assets/d245e284-741c-4036-a803-fa86ec185c06" />
<img width="1824" height="640" alt="d3075cef64f2032c0caaf76b474a964a" src="https://github.com/user-attachments/assets/9ebf0442-00ec-49ae-bde9-14330b280b46" />
<img width="1824" height="593" alt="af2a473247a552b48b5ddc290173e1c4" src="https://github.com/user-attachments/assets/9bc0b64f-de30-44a5-bd3c-ecbf74289265" />
<img width="928" height="1232" alt="0ed9e4ca3805ccf611058a161287c46f" src="https://github.com/user-attachments/assets/8bbdaf84-a028-45ab-bc56-53cdca833a7b" />
<img width="928" height="1232" alt="35e3ba86e00fcfa1b1b6c57975244182" src="https://github.com/user-attachments/assets/13f366ac-995c-48df-9c85-e9a3f6543e63" />


## 项目简介
本项目是一个简约的图片局部编辑工具，编辑会参考原图画风，编辑后完美符合原图风格，不违和，可以修改一张图中的指定文字内容，也可以修改图中局部元素。可以应用在各种仅需图片局部区域修改微调的场景，例如使用AI生成图片之后，整体满意，细节有问题，则可以直接对不满意区域框选之后输入修改指令编辑重绘。

## 核心特性

🎨 **智能生图** - 文字生成图片
🎨 **图片局部编辑** - 画笔涂抹或框选局部区域，输入编辑指令进行局部修改，可以一次性框选多处同时修改
👤 **用户管理系统** - 完整的用户注册登录、余额管理、兑换码系统
🔐 **管理后台** - 模型管理、用户管理、兑换码管理、使用日志、系统配置

### 🚀 开始你的项目

# 克隆仓库
   git clone https://github.com/chunxiuxiamo/ai-image-edit.git

#### 本地化开发（推荐）

```bash
# 1. 初始化新项目安装依赖项
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 Supabase 配置
# VITE_SUPABASE_URL=your-supabase-url
# VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# 3. 运行项目
npm run dev

# 访问方式地址
http://localhost:5173
```

### 🔧 Supabase 配置

1. 在 [Supabase](https://supabase.com) 创建项目
2. 在 SQL Editor 中执行 `supabase/migrations/001_initial_schema.sql` 文件中的 SQL
3. 配置 Authentication:
   - 启用 Email 登录
   - 启用 GitHub OAuth（在 Authentication > Providers > GitHub）
4. 复制项目 URL 和 anon key 到 `.env` 文件

### 👤 设置管理员

在 Supabase SQL Editor 中执行:
```sql
UPDATE public.profiles SET is_admin = TRUE WHERE email = 'your-admin@email.com';
```

#### docker-compose（推荐）

```bash
# 1. docker运行项目
初次构建运行： docker-compose up -d --build

后续启动
docker-compose up -d

停止项目
docker-compose down

# 2. 运行项目
npm run dev

# 本地docker访问方式地址(服务器上需要自行修改nginx配置)
http://localhost:8890

```


## 常见问题

<details>
<summary><b>Q: 为什么选择我的自定义生图模型报错？</b></summary>

A: 当前需要模型支持OpenAI API通用参数格式

</details>

<details>
<summary><b>Q: 为什么我的图片不需要修改的地方也被改动了？</b></summary>

A: 图片元素如果比较多比较复杂，可能会导致不稳定，影响到其不需要编辑修改的位置。

</details>

## 贡献指南

我们欢迎各种形式的贡献！

### 如何贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 贡献方向

- 🎨 兼容gemini-3绘图模型
- 🎨 兼容其他绘图模型
- 📝 完善文档和教程
- 🐛 报告 bug 和问题
- 💡 提出新功能建议
- 🌍 多语言支持
- 📁 分享你的项目案例到 `examples/` 目录

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

你可以自由地：

- ✅ 商业使用
- ✅ 修改源代码
- ✅ 分发和再授权
- ✅ 私人使用

但需要：

- 📋 保留版权声明
- 📋 保留许可证声明


## 📮 联系方式

- **Issue**: [GitHub Issues](https://github.com/chunxiuxiamo/ai-image-edit/issues)
- **GitHub**: [@chunxiuxiamo](https://github.com/chunxiuxiamo)
- **项目链接**: [https://github.com/chunxiuxiamo/ai-image-edit](https://github.com/chunxiuxiamo/ai-image-edit)
- **个人微信**：![8aeeaae52f366b19e7bfe05b07e0920a](https://github.com/user-attachments/assets/4d601a83-d19e-48e2-85f6-f36d957cebfc)

## 🌟 Star History

如果这个项目对你有帮助，请给一个 ⭐ Star 支持一下！
---
