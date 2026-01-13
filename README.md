# AI-Image-Edit - AI 图片生成与编辑平台

[![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](./VERSION)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/gloryhry/ai-image-edit.svg)](https://github.com/gloryhry/ai-image-edit/stargazers)
[![Docker Build](https://github.com/gloryhry/ai-image-edit/actions/workflows/docker-build.yml/badge.svg)](https://github.com/gloryhry/ai-image-edit/actions/workflows/docker-build.yml)

[English](./README_EN.md) | 中文

一个功能完善的 AI 图片生成与编辑平台，支持多种 AI 模型，具备完整的用户管理和计费系统。

## ✨ 功能特性

### 🎨 图片生成与编辑
- **文字生成图片** - 输入描述即可生成高质量图片
- **局部编辑** - 画笔涂抹或框选区域进行局部修改，可一次性修改多个区域
- **智能融合** - 编辑参考原图画风，保证修改后与原图风格统一

### 🤖 多模型支持
- **Gemini 官方 API** - 支持 Gemini 3 Pro、Gemini 2.5 Flash 等模型
- **OpenAI 兼容接口** - 支持即梦等符合 OpenAI API 格式的绘图模型
- **灵活配置** - 后台可自定义添加和管理模型

### 👤 用户管理系统
- **用户认证** - 支持邮箱注册、GitHub OAuth 登录
- **余额系统** - 按次计费，支持兑换码充值
- **新用户奖励** - 可配置新用户注册赠送金额

### 🔐 管理后台
- **模型管理** - 添加、编辑、启用/禁用模型
- **用户管理** - 查看用户列表，调整余额，禁用账户
- **兑换码管理** - 批量生成和管理兑换码
- **使用日志** - 查看所有 API 调用记录
- **系统配置** - 配置 API 密钥、Base URL 等

## 📸 效果展示

<img width="1920" alt="image" src="https://github.com/user-attachments/assets/ece324f0-573d-452e-a976-afdb326e8de4" />
<img width="1920" alt="image" src="https://github.com/user-attachments/assets/d245e284-741c-4036-a803-fa86ec185c06" />
<img width="1824" alt="image" src="https://github.com/user-attachments/assets/9ebf0442-00ec-49ae-bde9-14330b280b46" />

---

## 🚀 快速开始

### 前置条件

- Node.js 20+
- Docker & Docker Compose（可选，用于容器化部署）
- Supabase 账号

---

## 📦 部署指南

### 方式一：Docker Compose 部署（推荐）

这是最简单的部署方式，适合生产环境。

#### 1. 克隆仓库

```bash
git clone https://github.com/gloryhry/ai-image-edit.git
cd ai-image-edit
```

#### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Supabase Configuration (前端使用)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# API Server Configuration (后端使用)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

#### 3. 启动服务

```bash
# 首次构建并启动
docker-compose up -d --build

# 后续启动
docker-compose up -d

# 停止服务
docker-compose down
```

#### 4. 访问应用

- **前端页面**: http://localhost:8890
- **API 服务**: http://localhost:3001

#### 使用预构建镜像（可选）

如果不想本地构建，可以使用 GitHub Container Registry 上的预构建镜像：

```yaml
# docker-compose.yml
services:
  web:
    image: ghcr.io/gloryhry/ai-image-edit-frontend:latest
    ports:
      - "8890:80"
    restart: unless-stopped
    depends_on:
      - api

  api:
    image: ghcr.io/gloryhry/ai-image-edit-server:latest
    ports:
      - "3001:3001"
    restart: unless-stopped
    environment:
      - PORT=3001
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
```

---

### 方式二：本地开发

适合开发和调试。

#### 1. 克隆仓库并安装依赖

```bash
git clone https://github.com/gloryhry/ai-image-edit.git
cd ai-image-edit
npm install
```

#### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入 Supabase 配置。

#### 3. 启动开发服务器

```bash
# 启动前端
npm run dev

# 启动后端 API（在另一个终端）
cd server
npm install
node index.js
```

#### 4. 访问应用

- **前端页面**: http://localhost:5173
- **API 服务**: http://localhost:3001

---

## 🗄️ Supabase 配置指南

Supabase 是本项目的后端服务，提供用户认证、数据库和 API 功能。

### 步骤 1：创建 Supabase 项目

1. 访问 [Supabase](https://supabase.com) 并登录
2. 点击 "New Project" 创建新项目
3. 填写项目名称，选择数据库密码和区域
4. 等待项目创建完成（约 2 分钟）

### 步骤 2：初始化数据库

1. 进入项目，点击左侧菜单 **SQL Editor**
2. 点击 "New query"
3. 复制 `supabase/migrations/001_initial_schema.sql` 文件的全部内容
4. 粘贴到编辑器中，点击 **Run** 执行

该 SQL 脚本会创建以下表和功能：
- `profiles` - 用户资料表（余额、管理员标识等）
- `models` - 模型配置表
- `redemption_codes` - 兑换码表
- `usage_logs` - 使用日志表
- `system_settings` - 系统配置表
- `wallet_transactions` - 钱包交易记录表
- 自动创建用户资料的触发器
- 兑换码使用和余额扣款的函数
- Row Level Security (RLS) 策略

### 步骤 3：配置认证

#### 启用邮箱登录

1. 进入 **Authentication** > **Providers**
2. 确保 **Email** 已启用
3. 可选：关闭 "Confirm email" 以简化注册流程

#### 启用 GitHub OAuth（可选）

1. 进入 **Authentication** > **Providers** > **GitHub**
2. 启用 GitHub 提供商
3. 在 [GitHub Developer Settings](https://github.com/settings/developers) 创建 OAuth App：
   - **Homepage URL**: 你的应用地址
   - **Authorization callback URL**: `https://your-project.supabase.co/auth/v1/callback`
4. 将 Client ID 和 Client Secret 填入 Supabase

### 步骤 4：获取 API 密钥

1. 进入 **Settings** > **API**
2. 复制以下信息到 `.env` 文件：
   - **Project URL** → `VITE_SUPABASE_URL` 和 `SUPABASE_URL`
   - **anon public** → `VITE_SUPABASE_ANON_KEY` 和 `SUPABASE_ANON_KEY`
   - **service_role secret** → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ **安全警告**: `service_role` 密钥拥有完整的数据库权限，请勿在前端使用或泄露。

### 步骤 5：设置管理员

注册账号后，在 SQL Editor 中执行以下命令设置管理员：

```sql
UPDATE public.profiles 
SET is_admin = TRUE 
WHERE email = 'your-admin@email.com';
```

### 步骤 6：配置 API 密钥（在管理后台）

1. 使用管理员账号登录
2. 进入 **设置** 页面
3. 配置以下内容：
   - **OpenAI 兼容接口 Base URL** - 如 `https://api.openai.com` 或其他兼容接口
   - **OpenAI 兼容接口 API Key** - 对应的 API 密钥
   - **Gemini API Base URL** - 默认 `https://generativelanguage.googleapis.com`
   - **Gemini API Key** - Google AI 的 API 密钥
   - **新用户注册赠送金额** - 如 `1.00`
   - **兑换码购买链接** - 可选

---

## 🏗️ 项目架构

```
ai-image-edit/
├── src/                    # 前端源码 (React + Vite)
│   ├── components/         # 组件
│   ├── contexts/           # Context 状态管理
│   ├── lib/                # 工具库
│   └── pages/              # 页面
├── server/                 # 后端 API 服务 (Express)
│   └── index.js            # API 入口
├── supabase/
│   └── migrations/         # 数据库迁移脚本
├── nginx/                  # Nginx 配置
├── docker-compose.yml      # Docker Compose 配置
├── Dockerfile              # 前端 Docker 镜像
└── .github/workflows/      # GitHub Actions CI/CD
```

---

## 🔧 生产环境配置

### Nginx 反向代理

如果需要在服务器上使用域名访问，配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8890;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### HTTPS 配置

建议使用 Certbot 配置 SSL 证书：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## ❓ 常见问题

<details>
<summary><b>Q: 为什么选择我的自定义生图模型报错？</b></summary>

A: 当前需要模型支持 OpenAI API 通用参数格式。请确保模型提供商兼容 `/v1/images/generations` 或 `/v1/images/edits` 接口。

</details>

<details>
<summary><b>Q: 为什么我的图片不需要修改的地方也被改动了？</b></summary>

A: 图片元素如果比较多比较复杂，可能会导致不稳定，影响到其不需要编辑修改的位置。建议尽量缩小选择区域。

</details>

<details>
<summary><b>Q: 如何添加新的 AI 模型？</b></summary>

A: 使用管理员账号登录后，进入 **模型管理** 页面添加新模型。需要配置模型名称、提供商类型、价格等信息。

</details>

<details>
<summary><b>Q: Docker 构建失败怎么办？</b></summary>

A: 请确保 Docker 版本 >= 20.10，并检查网络连接。可以尝试使用预构建镜像。

</details>

---

## 🤝 贡献指南

我们欢迎各种形式的贡献！

### 如何贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 贡献方向

- 🎨 兼容更多绘图模型
- 📝 完善文档和教程
- 🐛 报告 bug 和问题
- 💡 提出新功能建议
- 🌍 多语言支持

---

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

---

## 📮 联系方式

- **Issue**: [GitHub Issues](https://github.com/gloryhry/ai-image-edit/issues)
- **GitHub**: [@gloryhry](https://github.com/gloryhry)
- **项目链接**: [https://github.com/gloryhry/ai-image-edit](https://github.com/gloryhry/ai-image-edit)

---

## 🌟 Star History

如果这个项目对你有帮助，请给一个 ⭐ Star 支持一下！
