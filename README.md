# Dugsiga — Simple School Management System (Somalia)

A practical, bilingual (**English & Somali / Af-Soomaali**) School Management System designed for schools in Somalia. Built with **React + Vite**, **Node.js + Express**, **MongoDB Atlas**, and **JWT authentication**.

## Core Features

- **Bilingual & Dual Theme**: Instant switch between English (`EN`) and Somali (`SO`), plus Light Mode and Dark Mode.
- **Role-Based Access (No Public Registration)**:
  - **School Admin**: Full access to students, teachers, classes & subjects, attendance, exams & grading rules, school fees & currency settings, reports, and staff user accounts.
  - **Teacher**: View assigned classes and students, mark daily attendance, enter exam marks, and view/print class results & report cards.
  - **Accountant**: Record student fee payments, print official payment receipts, track unpaid balances, and export financial reports.
- **Printable Documents & Exports**: Printable Student Profiles, Student Report Cards, Payment Receipts, and 6 School Reports with one-click Excel/CSV export.

## Project Structure

```
├── server.ts                  # Express + Vite / production API entry point
├── server/
│   ├── config.ts              # Environment configuration
│   ├── db.ts                  # MongoDB Atlas connection manager
│   ├── middleware/auth.ts     # JWT & role-based access middleware
│   ├── models/                # Mongoose schemas (User, Student, Teacher, Classroom, Attendance, ExamResult, FeePayment, SchoolSettings)
│   ├── routes/                # REST API endpoints (/api/auth, /api/students, /api/teachers, /api/classes, /api/attendance, /api/exams, /api/fees, /api/dashboard, /api/users, /api/settings)
│   └── utils/sanitize.ts      # Request input validation helpers
├── src/
│   ├── components/            # Layout shell, modals, school crest
│   ├── context/               # AuthContext (in-memory JWT) & ThemeContext (Light/Dark + EN/SO)
│   ├── i18n/translations.ts   # English & Somali dictionary
│   ├── pages/                 # Dashboard, Students, Teachers, Classes, Attendance, Exams, Fees, Reports, Settings
│   ├── types/index.ts         # TypeScript interfaces
│   └── utils/                 # REST API client & CSV export helpers
├── .env.example               # Required environment variable template
└── package.json
```

## Local Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env` and fill in your MongoDB Atlas connection string:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/dugsiga_sms?retryWrites=true&w=majority
   JWT_SECRET=replace-with-a-long-random-secret
   PORT=3000
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

4. **First-Run Admin Setup**:
   When the database has no users yet, the login screen automatically displays the **Initial School Admin Setup** form to create your first administrator account. Once created, public setup locks permanently and all Teacher and Accountant accounts are created inside **Users & Settings**.

## Production Deployment

### 1. Database — MongoDB Atlas
1. Create a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a database user and allow network access (`0.0.0.0/0` or Render outbound IPs).
3. Copy the connection string (`mongodb+srv://...`) into `MONGODB_URI`.

### 2. Backend — Render
1. Create a new **Web Service** on [Render](https://render.com) connected to your repository.
2. **Build Command**: `npm install && npm run build`
3. **Start Command**: `npm start`
4. **Environment Variables**:
   - `NODE_ENV=production`
   - `MONGODB_URI=<your-mongodb-atlas-uri>`
   - `JWT_SECRET=<strong-random-string>`
   - `CORS_ORIGIN=https://<your-frontend>.pages.dev`
   - `SERVE_FRONTEND=false` (if hosting the frontend separately on Cloudflare Pages)

### 3. Frontend — Cloudflare Pages (or Workers)
1. Connect your repository in [Cloudflare Pages](https://pages.cloudflare.com/).
2. **Build Command**: `npx vite build`
3. **Build Output Directory**: `dist`
4. **Environment Variable**:
   - `VITE_API_URL=https://<your-render-backend>.onrender.com`
