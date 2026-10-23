# DOFORT WORLD - Employee Joining System

Employees open a link (or scan a QR code) in Chrome, add their photo, fill the joining form and submit.
You see every record in the admin panel, approve or ask for corrections, and download everything as Excel, PDF, Word or CSV.
Employees and the admin can both edit a record after it is submitted.

## Put it online (about 15 minutes)

You need a free GitHub account and a Render account (render.com). Render's "Starter" plan (about 7 US dollars a month, plus about 0.50 dollars for the 2 GB disk) is required, because the database file must sit on a permanent disk. A free plan erases all data on every restart, so do not use it.

1. Create a new repository on github.com (private is fine). Click "uploading an existing file", drag in everything from this folder (the files and the `lib` and `public` folders), and commit.
2. On render.com choose New > Blueprint, connect that repository, and Render reads `render.yaml`.
3. When asked, type a strong `ADMIN_PASSWORD`. Render creates `APP_SECRET` for you. Open the service's Environment tab, copy the `APP_SECRET` value and store it somewhere safe (it unlocks the encrypted Aadhaar and bank fields in backups).
4. Wait for "Live". Render gives you an address such as `https://dofort-employee-form.onrender.com`. To use your own name such as `join.yourcompany.com`, add it under Settings > Custom Domains.
5. Open `https://your-address/admin`, sign in, and go to "Share link and QR". Copy the link, download the QR code, or print the poster.

Any other host that runs Node.js 22.13 or newer with a persistent folder also works: set `DATA_DIR` to that folder, run `node server.js`, and use HTTPS. A `Dockerfile` is included.

## Using it

- Employee link: your address (for example `https://dofort-employee-form.onrender.com/`)
- Admin panel: your address followed by `/admin`
- Each employee gets a reference number (DFW-0001...) and a private edit link. If they lose it they use "Find my form" with mobile number and date of birth.
- Admin: search, filter, sort, select several rows, change status, download data, open a record to see the photo and full details, edit it, download its BIO-DATA as PDF or Word, or delete it.
- Settings: close or open the form, pre-fill the company name, show a notice, change the password, download a backup.

## Safety

- Aadhaar and bank account numbers are encrypted in the database, shown masked in lists, and every view, export and change is written to the Activity log.
- Change the admin password at first sign-in. Login is limited to 8 tries per 15 minutes.
- Download a backup from Settings every week. Keep your `APP_SECRET` with it.
- PDF files use a standard font and show English text only. Excel, Word and CSV keep any language. Employees are asked to type in English.

## Run on your own computer to try it

Install Node.js 22.13 or newer, open a terminal in this folder and run `node server.js`, then open http://localhost:3000 (admin: http://localhost:3000/admin, default password `Admin@123`, change it at once).
