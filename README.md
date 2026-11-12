# Extension Roll Call

A small Chrome and Edge extension that answers one question for a small office: **what is installed in this browser, and what can it get at?**

It lists every extension, explains each permission in plain English, gives a risk rating, and exports the result as CSV, JSON or PDF.

## Why I built it

While researching browser management for small businesses in 2026, I kept running into the same gap. Large companies have consoles and security teams. A 40-person firm usually has one person who "looks after the computers" and no list of what staff have added to their browsers. This tool is the smallest useful version of that list: it runs on one machine, needs no account and no server, and gives the IT person something to print and act on.

## What it does

- Reads the list of installed extensions, themes and apps from the browser.
- Shows where each one came from: a store, an administrator policy, developer mode, or another program.
- Shows which websites each one can run on.
- Translates each permission into plain English.
- Gives a score from 0 to 100 and a level: Low, Medium, High or Critical.
- Lets you switch an extension off (and back on) from the report.
- Exports the audit as CSV or JSON, or prints it as a PDF.
- Lets you add an audit label such as "Accounts PC 3", so reports from several machines can be combined in a spreadsheet.

## Install it (unpacked)

1. Download this folder to your computer.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this folder.
5. Click the Extension Roll Call icon in the toolbar, then **Open the full report**.

Because it is loaded in developer mode, the report will list Extension Roll Call itself as "Developer mode". That is the tool working as intended.

## How the rating works

The score adds up three things.

| Part | Rule | Points |
|---|---|---|
| Website access | Can run on every website | 30 |
| | More than 10 site patterns | 15 |
| | 1 to 10 site patterns | 5 |
| Browser features | Each permission has a weight from 0 to 10 (see `risk.js`); the total is capped | up to 50 |
| Combination | Every-website access plus cookies, scripting, web requests or the debugger | +10 |
| Source | Added by another program, and not updating from an official store | +15 |
| | Developer mode, or not updating from an official store | +10 |
| | Added by another program, but updating from an official store | +5 |
| | Pre-installed by the browser itself (for example Google Docs Offline) | 0 |
| | Unknown source | +5 |
| | Installed by administrator policy | -10 |

Levels: 0 to 14 Low, 15 to 34 Medium, 35 to 59 High, 60 and above Critical.

**A high rating means powerful access, not bad intent.** A password manager scores high because it needs wide access to work. The rating tells you which extensions to look at first.

## What it does not do

- It does not read an extension's code or watch what it does on the network.
- It sees one browser profile at a time. Run it in each profile and on each machine you want to audit.
- It cannot change extensions that an administrator policy has locked.

## Privacy

Everything runs on your computer. The tool makes no network requests and has no analytics. The only thing it saves is the audit label you type, in the browser's local storage. See [PRIVACY.md](PRIVACY.md).

The one permission it asks for is `management`, which is what lets it read the list of installed extensions and switch one off when you ask.

## How it was made

The product idea, the rating rules and the testing are mine. The JavaScript was written with AI assistance. Before release I checked it against a set of demo extensions and on a real Windows computer running Chrome. That first real test found a false alarm: Chrome's own Google Docs Offline was flagged as "added by other software". The rule was corrected before version 1.0.0 was published.

## Licence

MIT. See [LICENSE](LICENSE).
