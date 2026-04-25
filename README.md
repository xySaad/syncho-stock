# 📦 Syncho Stock — AI-Powered Inventory Management System

A full-stack inventory management platform with role-based access, AI-powered OCR receipt scanning, real-time WebSocket notifications, and intelligent stock recommendations.

---

## Architecture

```
┌─────────────────┐     HTTP / WebSocket     ┌─────────────────┐     ┌──────────────┐
│   Next.js 14    │ ◄────────────────────►   │   Go / Gin      │ ◄─► │  PostgreSQL  │
│   Frontend      │                          │   Backend       │     │  Database    │
└─────────────────┘                          └─────────────────┘     └──────────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────┐
                                            │  Anthropic API  │
                                            │  (Claude Vision │
                                            │  + AI Reports)  │
                                            └─────────────────┘
```

## Roles & Features

| Role | Capabilities |
|------|-------------|
| **Worker** | Scan receipts (OCR via AI), validate/reject commands from supervisor |
| **Inventory Accountant** | View all receipts, generate AI buys/sells reports |
| **Supervisor** | Full access: stock, receipts, commands, create orders, AI recommendations & stock analysis |

---

## Tech Stack

- **Backend**: Go 1.21 + Gin framework
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: PostgreSQL 16
- **AI**: Anthropic Claude (vision OCR + text analysis)
- **Real-time**: WebSocket (gorilla/websocket)
- **Auth**: JWT tokens

---

## Quick Start

### Prerequisites

- Go 1.21+
- Node.js 20+
- PostgreSQL 16 running locally
- Anthropic API key

### 1. Clone & configure

```bash
git clone <repo>
cd inventory-app

# Set your Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Start with Docker Compose (easiest)

```bash
docker-compose up --build
```

Then open http://localhost:3000

### 3. Manual Setup

**Database:**
```bash
createdb inventory
```

**Backend:**
```bash
cd backend
go mod tidy
DB_HOST=localhost DB_USER=postgres DB_PASSWORD=postgres \
ANTHROPIC_API_KEY=sk-ant-... go run .
# Runs on :8080
```

**Frontend:**
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
# Runs on :3000
```

---

## Default Accounts

| Login | Password | Role |
|-------|----------|------|
| `admin` | `admin123` | supervisor |
| `worker1` | `admin123` | worker |
| `accountant1` | `admin123` | inventory_accountant |

---

## API Reference

### Auth
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/register` | Public |
| GET | `/api/me` | All |

### Receipts
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/receipts` | Worker, Supervisor | Upload image → AI OCR → store |
| GET | `/api/receipts` | All | List all receipts |

### Commands
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/commands` | All | List all commands |
| POST | `/api/command` | Supervisor | Create order command |
| POST | `/api/commands/:id/validate` | Worker | Validate or reject command |

### Stock
| Method | Endpoint | Access |
|--------|----------|--------|
| GET | `/api/stock` | All |

### AI Endpoints
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/recommendation` | Supervisor | AI restocking recommendations |
| GET | `/api/analysis` | Supervisor | AI stock health analysis |
| GET | `/api/report` | Accountant, Supervisor | AI buys/sells report |

### WebSocket
| Endpoint | Access | Events |
|----------|--------|--------|
| `GET /api/ws` | All | `new_receipt`, `new_command`, `command_updated` |

---

## Database Schema

```sql
users      (id, login, password_hash, role, created_at)
receipts   (id, name, quantity, price, supplier, date, image_url, created_at)
stock      (id, name, quantity, last_updated)
commands   (id, name, quantity, price, date, status, created_at)
```

---

## Environment Variables

### Backend
| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | localhost | PostgreSQL host |
| `DB_PORT` | 5432 | PostgreSQL port |
| `DB_USER` | postgres | DB username |
| `DB_PASSWORD` | postgres | DB password |
| `DB_NAME` | inventory | DB name |
| `JWT_SECRET` | supersecretkey | JWT signing secret |
| `ANTHROPIC_API_KEY` | - | **Required** for AI features |
| `PORT` | 8080 | Server port |

### Frontend
| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | http://localhost:8080 | Backend URL |

---

## Project Structure

```
app/
├── backend/
│   ├── main.go              # Router + server entry
│   ├── go.mod
│   ├── Dockerfile
│   ├── ai/
│   │   └── claude.go        # Anthropic API (OCR, recommendations, analysis)
│   ├── db/
│   │   └── db.go            # PostgreSQL connection + migrations
│   ├── handlers/
│   │   ├── auth.go          # Login / register / me
│   │   ├── receipts.go      # Upload + OCR + list
│   │   ├── commands.go      # CRUD + validate
│   │   ├── stock.go         # Stock + AI analysis/recommendation
│   │   └── websocket.go     # WS hub + handler
│   ├── middleware/
│   │   └── auth.go          # JWT + role middleware
│   └── models/
│       └── models.go        # Go structs
│
└── frontend/
    ├── app/
    │   ├── page.tsx          # Login
    │   ├── layout.tsx        # Root layout
    │   ├── globals.css       # Global styles
    │   ├── worker/page.tsx   # Receipt scanner + command validation
    │   ├── accountant/       # Reports + receipts table
    │   └── supervisor/       # Full dashboard + AI tabs
    ├── components/
    │   └── DashboardLayout.tsx
    ├── lib/
    │   └── api.ts            # Axios client + all API calls
    ├── middleware.ts          # Route auth protection
    └── Dockerfile
```
