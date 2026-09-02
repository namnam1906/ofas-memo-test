# ofas-memo — ผู้ช่วยร่างเอกสารราชการ

ผู้ช่วยร่างบันทึกข้อความ (และเอกสารราชการอื่นๆ ในอนาคต) ด้วย AI รันบน **Cloudflare Workers**

```
Memo Assistant
      │
      ├── ยังเป็น Prototype  ──▶  Cloudflare Worker + D1        ◀── สถานะปัจจุบันของ repo นี้
      │
      └── มี User/Login จริงจัง ──▶  Cloudflare Worker + Supabase (Postgres + Auth)   ◀── ขั้นถัดไป
```

Repo นี้ deploy ตามกิ่ง **Prototype** ก่อน (ยังไม่มีระบบสมาชิก/login) — โครงสร้างเขียนแยกชั้นไว้แล้ว
(`src/llm/*`, `documents` table ที่มีคอลัมน์ `owner_id` รอไว้) เพื่อให้ย้ายไป Supabase Auth ทีหลังได้โดยไม่ต้อง
เขียนใหม่ทั้งระบบ — ดู [Roadmap](#roadmap--ย้ายไป-supabase-auth) ด้านล่าง

## สถาปัตยกรรม

- **Frontend** (`public/index.html`) — หน้าเว็บเดียวจบ (form ร่างเอกสาร + โหมดแชท + preview + ดาวน์โหลด .docx)
  เดิมพอร์ตมาจาก Claude Artifact prototype ตัวก่อนหน้า ตอนนี้เรียก backend ของตัวเองแทน `claude.use('sample')`
  ส่วนการสร้างไฟล์ .docx ยังทำฝั่ง client ล้วนๆ เหมือนเดิม (ไม่ต้องพึ่ง backend)
- **Backend** (`src/index.ts`, [Hono](https://hono.dev)) — Cloudflare Worker ตัวเดียว serve ทั้งไฟล์ static
  (ผ่าน [Workers Assets](https://developers.cloudflare.com/workers/static-assets/)) และ API:
  - `POST /api/draft` — ร่างเนื้อหาบันทึกข้อความจากฟอร์ม
  - `POST /api/chat` — โหมดแชท (คุยทีละประเด็น เก็บข้อมูลจนพอร่างได้)
  - `POST /api/documents`, `GET /api/documents/:id` — เซฟ/โหลดสถานะเอกสารแบบไม่ระบุตัวตนใน D1
    (ยังไม่ผูกกับปุ่มไหนใน UI — เตรียมไว้ให้ต่อฟีเจอร์ "บันทึกร่าง/แชร์ลิงก์" ทีหลัง)
  - `GET /api/health`
- **LLM** (`src/llm/*`) — สลับได้ระหว่าง Anthropic (Claude) กับ Google Gemini ผ่าน env var `LLM_PROVIDER`
  โดยไม่ต้องแก้โค้ด ทั้งสอง provider ใช้ contract เดียวกัน (`LLMProvider.callJSON`)
- **D1** — ใช้ 2 อย่างตอนนี้: (1) rate-limit counter กัน endpoint AI ถูกยิงรัว (2) ตาราง `documents` ตามข้างต้น

**Prompt อยู่ฝั่งเซิร์ฟเวอร์ทั้งหมด** (`src/prompts.ts`) — client ส่งแค่ field ที่กรอกจริง (เช่น `orgName`,
`notes`, `turns`) ไม่ส่ง prompt ดิบ ป้องกันไม่ให้ endpoint ถูกใช้เป็น proxy เรียก LLM ตามใจชอบ

## เริ่มต้นใช้งาน (local dev)

ต้องมี Node.js 22+ และบัญชี Cloudflare (ฟรีก็ใช้ได้)

```bash
npm install
npx wrangler login          # ล็อกอินบัญชี Cloudflare ผ่านเบราว์เซอร์

# สร้าง D1 database ของโปรเจกต์ (ครั้งเดียว)
npx wrangler d1 create ofas_memo
# คำสั่งข้างบนจะพิมพ์ database_id ออกมา — เอาไปแทนที่
# "REPLACE_WITH_YOUR_D1_DATABASE_ID" ใน wrangler.toml

# apply schema เข้า D1 (local ก่อน สำหรับ wrangler dev)
npm run db:migrate:local
```

ตั้งค่า API key สำหรับ local dev ด้วยไฟล์ `.dev.vars` (ห้าม commit ไฟล์นี้ — อยู่ใน `.gitignore` แล้ว):

```bash
# .dev.vars
ANTHROPIC_API_KEY=sk-ant-...
# หรือถ้าจะใช้ Gemini แทน ให้ตั้ง LLM_PROVIDER=gemini ใน wrangler.toml ด้วย
GEMINI_API_KEY=...
```

```bash
npm run dev      # เปิดที่ http://localhost:8787
```

## Deploy ขึ้น Cloudflare

### ตั้งค่า secret (ครั้งเดียวต่อสภาพแวดล้อม ไม่ใช่ทุกครั้งที่ deploy)

```bash
npx wrangler secret put ANTHROPIC_API_KEY
# หรือ
npx wrangler secret put GEMINI_API_KEY
```

ค่าที่ตั้งด้วย `wrangler secret put` จะถูกเก็บที่ฝั่ง Cloudflare เท่านั้น ไม่โผล่ใน `wrangler.toml` หรือ repo

### apply migration เข้า D1 จริง แล้ว deploy

```bash
npm run db:migrate:remote
npm run deploy
```

### Deploy อัตโนมัติผ่าน GitHub Actions

Workflow อยู่ที่ `.github/workflows/deploy.yml` — ทำงานทุกครั้งที่ push เข้า `main` ต้องตั้งค่า
**Repository secrets** ก่อน (Settings → Secrets and variables → Actions):

| Secret | ได้จากไหน |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token (เทมเพลต "Edit Cloudflare Workers" ใช้ได้เลย ต้องมีสิทธิ์ D1 ด้วยถ้าจะให้ CI รัน migration) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → มุมขวาของหน้า Workers & Pages |

Workflow นี้ deploy โค้ด + apply migration เท่านั้น **ไม่ได้ตั้งค่า `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` ให้** — ต้องรัน
`wrangler secret put` เองตามข้างบน (ครั้งเดียว อยู่ถาวรที่ฝั่ง Cloudflare ไม่ต้องรันซ้ำทุก deploy)

## สลับ LLM provider

แก้ `LLM_PROVIDER` ใน `wrangler.toml` เป็น `"anthropic"` หรือ `"gemini"` แล้ว deploy ใหม่ (ไม่ต้องแก้โค้ด)
โมเดลที่ใช้ปรับได้ที่ `ANTHROPIC_MODEL` / `GEMINI_MODEL` ในไฟล์เดียวกัน

> ค่าเริ่มต้นคือ `claude-opus-5` — เป็นรุ่นความสามารถสูงสุดของ Anthropic ราคาต่อการเรียกจะสูงกว่ารุ่นเล็ก
> ถ้าปริมาณการใช้งานเยอะและอยากคุมต้นทุน พิจารณาเปลี่ยนเป็น `claude-sonnet-5` ได้ (งานร่างเอกสารแบบนี้ไม่ต้องการ
> reasoning ระดับสูงสุดเสมอไป) ส่วน `gemini-2.5-flash` เป็นค่าเริ่มต้นฝั่ง Gemini — ชื่อรุ่นของ Gemini
> เปลี่ยนบ่อย ควรเช็กกับเอกสารล่าสุดของ Google ก่อนใช้งานจริง

## ข้อควรระวังเรื่องความปลอดภัย (สำคัญ — อ่านก่อน launch จริง)

ตอนนี้อยู่ในระยะ **Prototype ไม่มีระบบยืนยันตัวตน** endpoint `/api/draft` และ `/api/chat` เรียกได้จากใครก็ได้ที่รู้ URL
มี rate limit พื้นฐาน (ต่อ IP ผ่าน D1, ปรับได้ที่ `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_SECONDS` ใน
`wrangler.toml`) กันสแปม/ต้นทุนบานปลายในระดับหนึ่ง แต่**ไม่ใช่การป้องกันที่แน่นหนา** — ก่อนเปิดให้คนนอกใช้งานจริง
ควรอย่างน้อยหนึ่งใน:

- เพิ่ม Cloudflare Rate Limiting Rule ที่ระดับ dashboard เป็นชั้นป้องกันเพิ่ม (defense in depth)
- ย้ายไปกิ่ง Supabase Auth (ดู Roadmap ด้านล่าง) แล้วผูก endpoint ทั้งสองไว้หลัง login

## Roadmap: ย้ายไป Supabase Auth

เมื่อพร้อมทำระบบสมาชิก/สิทธิ์ผู้ใช้จริง (กิ่งขวาของไดอะแกรมด้านบน) จุดที่ต้องแตะ:

1. สร้างโปรเจกต์ Supabase, เปิด Auth (email/password หรือ OAuth ตามต้องการ)
2. `documents.owner_id` ใน `migrations/0001_init.sql` เตรียมคอลัมน์ไว้แล้ว — เขียน migration ใหม่เพิ่ม FK
   ไปยัง Supabase `auth.users` (หรือย้ายตาราง `documents` ทั้งก้อนไป Postgres ฝั่ง Supabase ถ้าต้องการ RLS)
3. เพิ่ม middleware ใน `src/index.ts` ตรวจ JWT จาก Supabase ก่อนเข้าถึง `/api/draft`, `/api/chat`,
   `/api/documents/*`
4. D1 `rate_limit_hits` เปลี่ยนเป็น per-user quota แทน per-IP ได้ (โครงเดิมใน `src/ratelimit.ts` ปรับ key
   จาก IP เป็น user id ได้ตรงๆ)

## Endpoints

| Method | Path | Body | หมายเหตุ |
| --- | --- | --- | --- |
| GET | `/api/health` | — | health check |
| POST | `/api/draft` | `{orgName?, subject?, addressee?, purpose?, polite?, notes}` | คืน `{paragraphs: string[]}` |
| POST | `/api/chat` | `{turns: {role, content}[], images?: {mimeType, base64}[]}` | คืน `{assistantMessage, readyToDraft, fields, bodyParagraphs, quickReplies}` |
| POST | `/api/documents` | `{title?, data}` | คืน `{id, createdAt}` |
| GET | `/api/documents/:id` | — | คืนเอกสารที่เคยเซฟ หรือ 404 |

ทุก endpoint ที่ error ตอบกลับรูปแบบเดียวกัน: `{"error": {"code": "...", "message": "..."}}`
