# ofas-memo — ผู้ช่วยร่างเอกสารราชการ

ผู้ช่วยร่างบันทึกข้อความ (และเอกสารราชการอื่นๆ ในอนาคต) ด้วย AI รันบน **Cloudflare Workers**

```
Memo Assistant
      │
      ├── Cloudflare Worker + D1        ◀── เอกสาร/ข้อมูลยังอยู่ที่นี่
      │
      └── Cloudflare Worker + Supabase Auth   ◀── สถานะปัจจุบัน — login จริงแล้ว
```

ทุก endpoint ต้อง login ก่อนใช้งาน (ผ่าน Supabase Auth — ดู [Setup — Supabase Auth](#setup--supabase-auth))
เอกสารที่บันทึกไว้เป็นของแต่ละบัญชี ไม่มีใครอื่นเปิดได้แม้จะรู้ id ก็ตาม เอกสารเองยังเก็บอยู่ใน D1 เหมือนเดิม —
ย้ายมาแค่ระบบยืนยันตัวตน ไม่ได้ย้ายทั้งฐานข้อมูลไป Supabase Postgres

## ระบบนี้ทำงานยังไง (ฉบับเข้าใจง่าย ไม่ต้องมีพื้นฐานสาย Dev)

ส่วนนี้อธิบายภาพรวมแบบง่ายๆ ว่าระบบมีส่วนประกอบอะไรบ้าง แต่ละอย่างทำหน้าที่อะไร — ถ้าอยากรู้รายละเอียด
เชิงเทคนิค (endpoint, โค้ด, การตั้งค่า) ข้ามไปอ่านหัวข้อ "สถาปัตยกรรม" ด้านล่างได้เลย

### ภาพรวม

เว็บนี้คือ "ผู้ช่วย AI ร่างเอกสารราชการ" — ผู้ใช้กรอกข้อมูล/พิมพ์คุยกับ AI ว่าต้องการเอกสารแบบไหน ระบบจะช่วย
ร่างเนื้อหาให้ แล้วดาวน์โหลดเป็นไฟล์ Word (.docx) ได้ทันที พร้อมบันทึกร่างไว้ดูย้อนหลังได้ (ต้องสมัคร/เข้าสู่
ระบบก่อนถึงจะบันทึกร่างได้ — เอกสารของแต่ละคนแยกกัน ไม่มีใครเห็นของคนอื่น)

ระบบไม่ได้รันอยู่บนเครื่องคอมพิวเตอร์เครื่องใดเครื่องหนึ่งของใครคนหนึ่ง แต่ใช้บริการ "คลาวด์" (cloud —
คอมพิวเตอร์ของบริษัทอื่นที่เราเช่าใช้เป็นส่วนๆ ตามงาน) 2 เจ้าหลัก ทำงานร่วมกัน:

| บริการ | เปรียบเหมือน... | ทำหน้าที่อะไรในระบบนี้ |
| --- | --- | --- |
| **Cloudflare Workers** | เครื่องคอมพิวเตอร์กลางที่รันเว็บไซต์และ "สมอง" ของระบบ | รับคำขอจากผู้ใช้ทุกครั้ง (เปิดหน้าเว็บ, กดร่างเอกสาร, กดบันทึก ฯลฯ) แล้วประมวลผล/ส่งคำตอบกลับ — เป็น serverless คือไม่ต้องมีใครคอยเปิด-ปิดเซิร์ฟเวอร์เอง ใช้เท่าไหร่จ่ายเท่านั้น (ปริมาณใช้งานตอนนี้ยังอยู่ในแผนฟรีของ Cloudflare) |
| **Cloudflare D1** | ตู้เก็บแฟ้มเอกสาร/ฐานข้อมูล | เก็บ "ร่างบันทึกของฉัน" ที่ผู้ใช้กดบันทึกไว้ทั้งหมด และเก็บ "ข้อมูลส่วนตัว & Memory" (ชื่อหน่วยงาน/รายชื่อผู้ลงนาม/สมุดที่อยู่) ของแต่ละบัญชี |
| **Supabase (เฉพาะส่วน Auth)** | ยามตรวจบัตรก่อนเข้าประตู | ดูแลเรื่องสมัครสมาชิก/เข้าสู่ระบบ/ลืมรหัสผ่าน/เข้าสู่ระบบด้วย Google — ระบบนี้ใช้ **แค่** ฟีเจอร์ล็อกอินของ Supabase เท่านั้น **ไม่ได้** เอาข้อมูลเอกสารไปเก็บที่ Supabase (เอกสารทั้งหมดยังอยู่ใน Cloudflare D1 ข้างบน) |
| **Claude (Anthropic) หรือ Gemini (Google)** | ผู้ช่วยเขียนเอกสารที่อยู่เบื้องหลัง | เป็น AI ที่อ่านข้อมูล/ประเด็นที่ผู้ใช้กรอกหรือพิมพ์คุยด้วย แล้วช่วยแต่งเนื้อหาเอกสารให้เป็นภาษาราชการ — เลือกได้ว่าจะใช้เจ้าไหน (ตั้งค่าที่เดียว ไม่ต้องแก้โค้ด) |
| **GitHub + GitHub Actions** | ที่เก็บโค้ดต้นฉบับ + ทีมงานที่คอยติดตั้งอัตโนมัติ | เก็บซอร์สโค้ดทั้งหมดของระบบ ทุกครั้งที่มีการแก้ไขโค้ดแล้ว push เข้ากิ่ง `main` จะมีการ "deploy" (นำโค้ดเวอร์ชันใหม่ขึ้นไปใช้งานจริงบน Cloudflare) ให้อัตโนมัติ ไม่ต้องมีคนกดปุ่ม deploy เอง |

### ขั้นตอนคร่าวๆ เวลาผู้ใช้กด "ร่างเนื้อหาด้วย AI"

```
ผู้ใช้กรอกฟอร์ม/พิมพ์คุย
        │
        ▼
เบราว์เซอร์ส่งข้อมูลไปหา Cloudflare Worker (ผ่านอินเทอร์เน็ต, เข้ารหัส HTTPS)
        │
        ▼
Worker ตรวจก่อนว่า login อยู่จริงไหม (เช็คกับ Supabase Auth)
        │
        ▼
Worker ส่งข้อมูลต่อไปให้ AI (Claude หรือ Gemini) พร้อมคำสั่งที่ตั้งไว้ล่วงหน้า
ว่าต้องร่างเอกสารแบบราชการยังไง
        │
        ▼
AI ร่างเนื้อหากลับมา → Worker ส่งกลับไปที่เบราว์เซอร์ → ขึ้นในช่อง preview เอกสาร
```

หมายเหตุ: "คำสั่ง/พรอมต์" ที่บอก AI ว่าต้องเขียนแบบไหน อยู่ในโค้ดฝั่งเซิร์ฟเวอร์เท่านั้น ผู้ใช้ไม่เห็นและแก้ไขไม่ได้
โดยตรง — ส่งให้ AI แค่ข้อมูลที่กรอกจริงๆ

### ขั้นตอนตอนกด "💾 บันทึกร่าง"

```
กดบันทึกร่าง → Worker ตรวจว่าเป็นใคร (จาก session ที่ล็อกอินไว้)
             → บันทึกเนื้อหาเอกสารลง Cloudflare D1 ผูกกับบัญชีนั้น
             → ครั้งถัดไปที่กดบันทึกร่างเดิม จะ "อัปเดต" ทับของเดิม ไม่สร้างซ้ำ
```

ส่วนไฟล์ .docx ที่ดาวน์โหลด — สร้างขึ้นทันทีในเบราว์เซอร์ของผู้ใช้เอง (ไม่ต้องส่งไปประมวลผลที่เซิร์ฟเวอร์)
ดังนั้นแม้ backend จะมีปัญหาชั่วคราว การกดดาวน์โหลดไฟล์ก็ยังทำงานได้ตราบใดที่หน้าเว็บโหลดสำเร็จแล้ว

### ความปลอดภัย/ความเป็นส่วนตัว แบบเข้าใจง่าย

- เอกสารและข้อมูลส่วนตัวของแต่ละบัญชี **แยกจากกันเด็ดขาด** — ต่อให้เดา id เอกสารของคนอื่นถูก ก็เปิดไม่ได้ถ้า
  ไม่ได้ล็อกอินเป็นเจ้าของ
- รหัสผ่านของผู้ใช้ไม่ได้ถูกเก็บ/มองเห็นโดยระบบนี้เลย — Supabase เป็นคนดูแลเรื่องรหัสผ่านทั้งหมดตามมาตรฐาน
  ความปลอดภัยของเขา (เข้ารหัสไว้ ไม่มีใครเปิดดูรหัสผ่านตรงๆ ได้แม้แต่ผู้ดูแลระบบ)
- คีย์ลับต่างๆ (API key ของ Claude/Gemini, token สำหรับ deploy) ถูกเก็บแยกไว้ในระบบ "secret" ของ
  Cloudflare/GitHub เท่านั้น ไม่ได้ฝังอยู่ในโค้ดที่ใครก็เปิดดูได้

### ใครจ่ายค่าอะไรบ้าง (โดยสรุป)

- **Cloudflare Workers / D1** — อยู่ในแผนฟรี (Free tier) ได้จนกว่าปริมาณการใช้งานจะสูงมากๆ
- **Supabase Auth** — อยู่ในแผนฟรีได้เช่นกันสำหรับจำนวนผู้ใช้ระดับนี้
- **ค่าใช้จ่ายจริงที่มีตามการใช้งาน** คือค่าเรียก AI (Claude หรือ Gemini) เท่านั้น — คิดตามจำนวนครั้ง/ปริมาณ
  ข้อความที่ร่าง ยิ่งใช้เยอะยิ่งมีค่าใช้จ่ายส่วนนี้เพิ่มตามจริง

## สถาปัตยกรรม

- **Frontend** (`public/index.html`) — หน้าเว็บเดียวจบ (form ร่างเอกสาร + โหมดแชท + preview + ดาวน์โหลด .docx +
  หน้า login + เมนูบัญชีผู้ใช้) เดิมพอร์ตมาจาก Claude Artifact prototype ตัวก่อนหน้า ตอนนี้เรียก backend ของ
  ตัวเองแทน `claude.use('sample')` ส่วนการสร้างไฟล์ .docx ยังทำฝั่ง client ล้วนๆ เหมือนเดิม (ไม่ต้องพึ่ง backend)
  ระบบ login ใช้ [`@supabase/supabase-js`](https://supabase.com/docs/reference/javascript) โหลดผ่าน CDN
  โดยตรง (ไฟล์นี้ไม่มี build step) — รองรับทั้งอีเมล/รหัสผ่านและ Google รวมถึงลิงก์ "ลืมรหัสผ่าน?"
  (`resetPasswordForEmail` → คลิกลิงก์ในอีเมล → หน้าตั้งรหัสผ่านใหม่) เมนู dropdown ที่ด้านล่างของ sidebar
  (คลิกที่รูปโปรไฟล์) มี "โปรไฟล์" (แก้ชื่อที่แสดง), "ข้อมูลส่วนตัว & Memory" (บันทึกชื่อหน่วยงาน/รายชื่อผู้ลงนาม/
  สมุดที่อยู่ ไว้ pre-fill ฟอร์มร่างใหม่อัตโนมัติ), "ร่างบันทึกของฉัน", และ "ออกจากระบบ" — sidebar เองก็มีลิสต์
  ร่างบันทึกล่าสุด 5 รายการโผล่ขึ้นมาให้กดเปิดเร็วๆ ด้วย (อยู่ใต้เมนูประเภทเอกสาร เหนือส่วนโปรไฟล์)
- **Backend** (`src/index.ts`, [Hono](https://hono.dev)) — Cloudflare Worker ตัวเดียว serve ทั้งไฟล์ static
  (ผ่าน [Workers Assets](https://developers.cloudflare.com/workers/static-assets/)) และ API:
  - `POST /api/draft` — ร่างเนื้อหาบันทึกข้อความจากฟอร์ม
  - `POST /api/chat` — โหมดแชท (คุยทีละประเด็น เก็บข้อมูลจนพอร่างได้)
  - `GET /api/documents`, `POST /api/documents`, `GET /api/documents/:id`, `DELETE /api/documents/:id` —
    รายการ/เซฟ/โหลด/ลบร่างเอกสารของผู้ใช้ที่ login อยู่ ผูกกับปุ่ม "💾 บันทึกร่าง" เมนู "📂 ร่างบันทึกของฉัน"
    และลิสต์ล่าสุดใน sidebar แล้ว (ทั้งโหมดฟอร์มและโหมดแชท)
  - `GET /api/profile`, `PUT /api/profile` — ข้อมูล "ข้อมูลส่วนตัว & Memory" ของผู้ใช้ที่ login อยู่ (ชื่อ
    หน่วยงาน/รายชื่อผู้ลงนาม/สมุดที่อยู่ — JSON blob เดียว) ผูกกับเมนู "ข้อมูลส่วนตัว & Memory" แล้ว
  - `GET /api/health` — จุดเดียวที่ไม่ต้อง login
  - ทุก route อื่นผ่าน middleware ตรวจ JWT จาก Supabase (`src/auth.ts`) ก่อนเสมอ — ไม่ login ได้ `401
    unauthorized`
- **LLM** (`src/llm/*`) — สลับได้ระหว่าง Anthropic (Claude) กับ Google Gemini ผ่าน env var `LLM_PROVIDER`
  โดยไม่ต้องแก้โค้ด ทั้งสอง provider ใช้ contract เดียวกัน (`LLMProvider.callJSON`)
- **D1** — ใช้ 3 อย่าง: (1) rate-limit counter กัน endpoint AI ถูกยิงรัว (2) ตาราง `documents` (มี `owner_id`
  ผูกกับ Supabase user id) (3) ตาราง `user_profiles` — "ข้อมูลส่วนตัว & Memory" ของแต่ละบัญชี
- **Supabase** — ใช้เฉพาะส่วน **Auth** (อีเมล/รหัสผ่าน + Google OAuth) ไม่ได้ใช้ Postgres/ฐานข้อมูลฝั่ง Supabase
  เลย — เอกสารและข้อมูลผู้ใช้ยังอยู่ใน D1 ทั้งหมด การตรวจ JWT ฝั่ง Worker ใช้ Supabase JWKS (public key) ไม่ต้อง
  มี secret ใดๆ เพิ่มบน Worker

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

ต้องตั้งค่า Supabase ก่อนถึงจะ login ได้แม้ใน local dev — ดู [Setup — Supabase Auth](#setup--supabase-auth)
ด้านล่าง (ใช้โปรเจกต์ Supabase เดียวกับ production ได้เลย ไม่ต้องแยก แค่เพิ่ม `http://localhost:8787` ใน
Redirect URLs ถ้าจะใช้ Google login ตอน dev ด้วย)

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

## Setup — Supabase Auth

ต้องทำครั้งเดียวก่อนใช้งานได้จริง (ทั้ง local dev และ production ใช้โปรเจกต์ Supabase เดียวกันได้ ไม่จำเป็นต้องแยก):

1. สร้างบัญชี/โปรเจกต์ที่ [supabase.com](https://supabase.com) (มีแผนฟรี) — เลือก region ใกล้ผู้ใช้งาน,
   ตั้งรหัสผ่าน database ไว้ก็ได้แต่ **ไม่ได้ใช้** (repo นี้ใช้แค่ฟีเจอร์ Auth ของ Supabase ไม่ได้ใช้ Postgres)
2. Project Settings → API — คัดลอกสองค่านี้:
   - **Project URL** (เช่น `https://xxxxxxxx.supabase.co`)
   - **anon public** key (ไม่ใช่ `service_role` — ห้ามใช้ key นั้นฝั่ง client เด็ดขาด)
3. ใส่ **Project URL** ลง 2 ที่:
   - `wrangler.toml` → `[vars]` → `SUPABASE_URL` (แทน `REPLACE_WITH_YOUR_SUPABASE_PROJECT_REF`)
   - `public/index.html` → ค้นหา `SUPABASE_URL` ในสคริปต์บล็อกสุดท้าย (auth module) → แทนค่าเดียวกัน
4. ใส่ **anon public key** ลง `public/index.html` เดียวกัน ตัวแปร `SUPABASE_ANON_KEY` (ค่านี้ปลอดภัยที่จะฝังใน
   โค้ด client — Supabase ออกแบบมาให้ public อยู่แล้ว, `.dev.vars`/secret ไม่เกี่ยวกับค่านี้)
5. Authentication → Sign In / Providers → เปิด **Email** (ปกติเปิดอยู่แล้วเป็นค่าเริ่มต้น)
6. Authentication → URL Configuration → ใส่ **Site URL** และ **Redirect URLs** เป็น URL จริงของ Worker
   (เช่น `https://ofas-memo.<subdomain>.workers.dev` และ `http://localhost:8787` สำหรับ local dev) —
   **สำคัญ**: ค่าเริ่มต้นของ Supabase คือ `http://localhost:3000` ถ้าไม่แก้ตรงนี้ ลิงก์ยืนยันอีเมลตอนสมัครสมาชิก
   (ไม่ใช่แค่ Google login) จะ redirect ไปหน้าที่เปิดไม่ได้
7. Authentication → Providers → Email (ที่ `/dashboard/project/_/auth/providers?provider=Email`) → ตั้งกฎ
   รหัสผ่านให้ตรงกับที่ frontend เช็คไว้ (`public/index.html` auth module, ตัวแปร `PASSWORD_PATTERN`):
   - **Minimum password length**: `8`
   - **Password Requirements**: เลือก "Letters and digits" (ต้องมีทั้งตัวอักษรและตัวเลข)

   ฝั่ง frontend เช็คกฎเดียวกันนี้ก่อนส่งไปหา Supabase อยู่แล้ว (กันไม่ให้ผู้ใช้เห็น error หลัง round-trip) แต่การ
   บังคับจริงต้องตั้งที่ Supabase ด้วย เพราะ frontend เป็นแค่ JavaScript ที่แก้ไข/ข้ามได้จากฝั่ง client

### เปิด Google Login เพิ่ม (ถ้าต้องการ)

1. [Google Cloud Console](https://console.cloud.google.com) → สร้างโปรเจกต์ (หรือใช้ของเดิม) → APIs &
   Services → Credentials → Create Credentials → **OAuth client ID** → Application type: **Web application**
2. Authorized redirect URIs ใส่: `https://<project-ref>.supabase.co/auth/v1/callback` (หาค่านี้ได้จาก
   Supabase dashboard → Authentication → Providers → Google — มันจะโชว์ URL ที่ต้องใส่ให้เลย)
3. คัดลอก **Client ID** และ **Client secret** ที่ได้ ไปใส่ที่ Supabase dashboard → Authentication →
   Providers → Google → เปิดใช้งาน แล้ววาง Client ID/Secret ตรงนั้น

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

## ข้อควรระวังเรื่องความปลอดภัย

ทุก endpoint (ยกเว้น `/api/health`) ต้อง login ก่อนเรียกได้ — ตรวจ JWT จาก Supabase ทุกครั้งที่ฝั่ง Worker
(`src/auth.ts`) เอกสารใน D1 ถูกกรองด้วย `owner_id` เสมอ (`WHERE owner_id = <user จาก JWT>`) เพื่อไม่ให้ผู้ใช้
คนหนึ่งเห็น/แก้/ลบเอกสารของอีกคนได้แม้จะรู้ id ก็ตาม

ยังมี rate limit ต่อ IP (ผ่าน D1, ปรับได้ที่ `RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_SECONDS` ใน
`wrangler.toml`) เป็นชั้นป้องกันเพิ่มเติมบน `/api/draft`/`/api/chat` แม้จะ login แล้วก็ตาม กันบัญชีเดียวยิงรัวเกินไป

จุดที่ยังทำเป็นขั้นถัดไปได้ (ไม่บล็อกการใช้งานตอนนี้):

- Rate limit ผูกกับ user id แทน/เพิ่มเติมจาก IP ได้ (โครงเดิมใน `src/ratelimit.ts` ปรับ key ตรงๆ) — ตอนนี้ยังเป็น
  per-IP ล้วนๆ
- เพิ่ม Cloudflare Rate Limiting Rule ที่ระดับ dashboard เป็นชั้นป้องกันเพิ่ม (defense in depth)
- เปิด Row Level Security ถ้าย้ายตาราง `documents` ไป Supabase Postgres ในอนาคต (ตอนนี้ D1 ไม่มี RLS แบบ
  Postgres — การกรอง `owner_id` ทำที่ชั้น application code ใน `src/index.ts` แทน)

## Endpoints

ทุก path ยกเว้น `/api/health` ต้องส่ง header `Authorization: Bearer <supabase access_token>` — ไม่งั้นได้
`401 unauthorized` (ฝั่ง frontend แนบ header นี้ให้อัตโนมัติทุกครั้งหลัง login แล้ว)

| Method | Path | Body | หมายเหตุ |
| --- | --- | --- | --- |
| GET | `/api/health` | — | health check — จุดเดียวที่ไม่ต้อง login |
| POST | `/api/draft` | `{orgName?, subject?, addressee?, purpose?, polite?, notes}` | คืน `{paragraphs: string[]}` |
| POST | `/api/chat` | `{turns: {role, content}[], images?: {mimeType, base64}[]}` | คืน `{assistantMessage, readyToDraft, fields, bodyParagraphs, quickReplies}` |
| GET | `/api/documents` | — | รายการเอกสารของผู้ใช้ที่ login อยู่ คืน `{documents: {id, title, createdAt, updatedAt}[]}` |
| POST | `/api/documents` | `{title?, data}` | บันทึกเอกสารใหม่ คืน `{id, createdAt}` — `owner_id` ตั้งจาก JWT อัตโนมัติ |
| GET | `/api/documents/:id` | — | คืนเอกสาร ถ้าเป็นของผู้ใช้ที่ login อยู่ ไม่งั้น 404 (ไม่บอกว่ามีอยู่จริงแต่เป็นของคนอื่น) |
| DELETE | `/api/documents/:id` | — | ลบเอกสาร (เฉพาะของตัวเอง) คืน `{ok: true}` หรือ 404 |
| GET | `/api/profile` | — | คืน `{data}` — "ข้อมูลส่วนตัว & Memory" ของผู้ใช้ที่ login อยู่ (`{}` ถ้ายังไม่เคยบันทึก) |
| PUT | `/api/profile` | `{data}` | บันทึก/อัปเดตทั้งก้อน (upsert) คืน `{ok: true, updatedAt}` |

ทุก endpoint ที่ error ตอบกลับรูปแบบเดียวกัน: `{"error": {"code": "...", "message": "..."}}`
