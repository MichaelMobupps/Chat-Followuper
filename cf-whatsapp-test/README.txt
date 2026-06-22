cf-whatsapp-test
================

WHAT THIS IS
  A dead-simple way to prove the WhatsApp send works, by sending a message to
  your own number. It replaces the empty Accounts screen with a small tool:
  enter a number, see the message, open WhatsApp with it ready, press send.

WHY IT IS RELIABLE
  The tool opens WhatsApp the instant you click, in the same motion, so the
  browser does not treat it as a blocked pop-up. It also shows the raw link so
  you can open it by hand if you ever want to.

SCOPE
  Dashboard only. One file changed: src/pages/accounts.tsx. No backend, no new
  dependency, no geo gate, no database. Pure link-and-open, the same mechanism
  the real screens use.

DEPLOY
  1. Upload cf-whatsapp-test.zip into ~/workspace.
  2. cd ~/workspace
  3. python3 -c "import zipfile; zipfile.ZipFile('cf-whatsapp-test.zip').extractall('.')"
  4. bash cf-whatsapp-test/apply.sh
  5. Click Restart, then click Republish.
  6. Open Accounts in the left menu and run a test.

USING IT
  Enter a WhatsApp number you can check, with the country code, for example
  your own. Press Open in WhatsApp. WhatsApp opens with the message ready.
  Press send. If WhatsApp says you cannot message yourself, use a second
  number or a colleague's number. The test still proves the app builds the
  link and opens WhatsApp correctly, which is the part being checked.

AUDIT (v2)
  Verified: the link is correct for WhatsApp (digits only, no plus sign,
  message URL-encoded), with no injection surface, since the digits are
  stripped to numerals and the message is encoded into a fixed wa.me address.
  The open is reliable: it fires inside the click, which browsers do not
  block, with the visible link as a plain navigation backup. Pure client side,
  nothing stored, nothing sent beyond the WhatsApp navigation, and the opened
  tab cannot reach back into the app.

  Fixed in v2: the screen now shows the exact number it will open, and a soft
  hint when the number starts with a zero, so a failed test reads as a number
  format issue rather than a broken app.

  Scope note: this proves the client mechanism, building the link and opening
  WhatsApp. It does not exercise the server path the prospect screens use, the
  geo gate and backend deep link. A pass here means the foundation is sound.

BLAST RADIUS
  One frontend file is swapped, the Accounts page, under the same export the
  route already loads, so nothing else changes. No backend, no route or menu
  edits, no schema, no migration, no dependency, no network call, no storage.
  The change cannot affect any other screen or any data. If the file were
  broken the only casualty is the Accounts screen, and the timestamped backup
  restores it. The build is the deploy gate.
