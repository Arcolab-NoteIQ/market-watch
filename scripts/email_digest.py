#!/usr/bin/env python3
"""Pivot Path Market Watch: twice-weekly email digest.

Reads data/*.json, works out what is new since the last digest (tracked in
email/state.json), builds a branded HTML email and sends it through Gmail SMTP.

Environment variables:
  GMAIL_USER          sending Gmail address (e.g. pivotpath2026@gmail.com)
  GMAIL_APP_PASSWORD  16-character Gmail app password
  MAIL_TO             comma-separated recipient list
  DASHBOARD_URL       link to the team dashboard
  UPDATE_STATE        "true" to record what was sent (scheduled runs), "false" for tests
  DRY_RUN             "true" to write the email to email/preview.html instead of sending
"""
import html
import json
import os
import smtplib
import ssl
import sys
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STATE_FILE = ROOT / "email" / "state.json"
IST = timezone(timedelta(hours=5, minutes=30))
TODAY = datetime.now(IST).date()

PRODUCTS = ["NoteIQ", "AnomIQ", "InvestigationIQ", "GoLanzar", "Pivot-MES", "NovaVigil"]
SERVICES = ["Pharmacovigilance", "CSV", "Data Management", "Clinical Operations", "Digital Transformation"]
SIG_ORDER = {"High": 0, "Medium": 1, "Low": 2}

TEAL, OLIVE, INK, MUTED, LINE, WARM = "#0F929D", "#20A676", "#212529", "#5f6368", "#e4e4dc", "#FCFCF5"


def load(name, default):
    try:
        return json.loads((DATA / name).read_text(encoding="utf-8"))
    except Exception:
        return default


def env(name, default=""):
    return os.environ.get(name, default).strip()


def d(s):
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def fmt(s):
    x = d(s)
    return x.strftime("%d %b %Y").lstrip("0") if x else ""


# Stable keys: the Monday full refresh may renumber ids and reword text, so key on URLs.
def key_news(r):
    return "n|" + (r.get("url") or r.get("headline", ""))


def key_fda(r):
    return "f|" + (r.get("url") or f"{r.get('company')}|{r.get('event_date')}")


def key_comp(r):
    return "c|" + "|".join([r.get("area", ""), r.get("competitor", ""), r.get("move_date", ""), r.get("url", "")])


def real_move(r):
    return bool(r.get("move_date")) and not str(r.get("latest_move", "")).startswith("No ")


def main():
    news = load("news.json", [])
    fda = load("fda.json", [])
    comp = [r for r in load("competitors.json", []) if real_move(r)]
    run = (load("run.json", [{}]) or [{}])[0]

    first_run = not STATE_FILE.exists()
    state = {} if first_run else json.loads(STATE_FILE.read_text(encoding="utf-8"))
    seen = state.get("seen", {})  # key -> date first emailed or first seen
    last_sent = d(state.get("last_sent")) or (TODAY - timedelta(days=7))

    if first_run:
        # Baseline: treat the last 14 days of news and moves, and the 10 newest FDA records, as new.
        cut = TODAY - timedelta(days=14)
        new_news = [r for r in news if (d(r.get("date")) or date.min) >= cut]
        new_fda = sorted(fda, key=lambda r: r.get("event_date", ""), reverse=True)[:10]
        new_comp = [r for r in comp if (d(r.get("move_date")) or date.min) >= cut]
    else:
        new_news = [r for r in news if key_news(r) not in seen]
        new_fda = [r for r in fda if key_fda(r) not in seen]
        new_comp = [r for r in comp if key_comp(r) not in seen]

    total_new = len(new_news) + len(new_fda) + len(new_comp)

    # Quiet period: no new items, so recap last week's developments instead.
    recap = []
    if total_new == 0:
        week = TODAY - timedelta(days=7)
        recap = [r for r in news if (d(r.get("date")) or date.min) >= week]
        if not recap:
            recap = sorted(news, key=lambda r: r.get("date", ""), reverse=True)[:5]

    dash = env("DASHBOARD_URL", "https://arcolab-noteiq.github.io/market-watch/")
    subject, html_body, text_body = build(new_news, new_fda, new_comp, recap, total_new, last_sent, run, dash, first_run)

    if env("DRY_RUN").lower() == "true":
        out = ROOT / "email" / "preview.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(html_body, encoding="utf-8")
        (ROOT / "email" / "preview.txt").write_text(f"Subject: {subject}\n\n{text_body}", encoding="utf-8")
        print(f"Dry run: wrote {out} | subject: {subject} | new: {total_new}")
    else:
        send(subject, html_body, text_body)

    if env("UPDATE_STATE").lower() == "true":
        for r in news:
            seen.setdefault(key_news(r), TODAY.isoformat())
        for r in fda:
            seen.setdefault(key_fda(r), TODAY.isoformat())
        for r in comp:
            seen.setdefault(key_comp(r), TODAY.isoformat())
        # Forget keys older than 180 days to keep the file small.
        keep_from = (TODAY - timedelta(days=180)).isoformat()
        seen = {k: v for k, v in seen.items() if v >= keep_from}
        STATE_FILE.parent.mkdir(exist_ok=True)
        STATE_FILE.write_text(json.dumps({"last_sent": TODAY.isoformat(), "seen": seen}, indent=1, sort_keys=True), encoding="utf-8")
        print(f"State updated: {len(seen)} keys")


# ---------- email building ----------

def e(s):
    return html.escape(str(s or ""))


def a(url, label, color=TEAL):
    if url and str(url).startswith("https://"):
        return f'<a href="{e(url)}" style="color:{color};text-decoration:underline;">{e(label)}</a>'
    return e(label)


def pill(text, bg, fg="#ffffff"):
    return (f'<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:{bg};color:{fg};'
            f'font-size:11px;font-weight:600;line-height:18px;">{e(text)}</span>')


SIG_COL = {"High": "#C0392B", "Medium": "#F9B200", "Low": "#808285"}


def news_block(r):
    sig = r.get("signal", "")
    meta = f'{pill(r.get("area", ""), OLIVE)} &nbsp;{pill(sig, SIG_COL.get(sig, MUTED), "#212529" if sig == "Medium" else "#ffffff")} &nbsp;<span style="color:{MUTED};font-size:12px;">{e(fmt(r.get("date")))} · {e(r.get("type"))}</span>'
    return (f'<tr><td style="padding:12px 0;border-bottom:1px solid {LINE};">'
            f'<div style="margin-bottom:4px;">{meta}</div>'
            f'<div style="font-size:15px;font-weight:700;color:{INK};margin:4px 0;">{a(r.get("url"), r.get("headline"), INK)}</div>'
            f'<div style="font-size:14px;color:{INK};line-height:1.5;"><b>Why it matters:</b> {e(r.get("why_it_matters"))}</div>'
            f'<div style="font-size:12px;color:{MUTED};margin-top:4px;">{e(r.get("company"))} · {e(r.get("source"))}</div>'
            f'</td></tr>')


def section(title, accent, rows_html, note=""):
    if not rows_html:
        return ""
    n = f'<p style="margin:0 0 4px;font-size:13px;color:{MUTED};">{e(note)}</p>' if note else ""
    return (f'<tr><td style="padding:24px 28px 0;">'
            f'<h2 style="margin:0 0 6px;font-size:18px;text-transform:uppercase;letter-spacing:.3px;color:{INK};">{e(title)} <span style="color:{OLIVE};">{e(accent)}</span></h2>{n}'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows_html}</table></td></tr>')


def fda_table(rows):
    if not rows:
        return ""
    # Newest first, then a stable sort that moves Indian sites to the top.
    rows = sorted(rows, key=lambda r: r.get("event_date", ""), reverse=True)
    rows = sorted(rows, key=lambda r: 0 if "India" in r.get("location", "") else 1)
    th = f'style="background:{OLIVE};color:#fff;text-align:left;padding:6px 8px;font-size:12px;"'
    td = f'style="padding:8px;border-bottom:1px solid {LINE};font-size:13px;vertical-align:top;color:{INK};"'
    body = "".join(
        f'<tr><td {td}><span style="font-size:11px;font-weight:700;color:{OLIVE};text-transform:uppercase;">{e(r.get("doc_type"))}</span><br>'
        f'{a(r.get("url"), r.get("company"), TEAL)}<br><span style="color:{MUTED};font-size:12px;">{e(r.get("location"))}<br>{e(fmt(r.get("event_date")))}</span></td>'
        f'<td {td}>{e(r.get("synopsis")) or f"<span style=color:{MUTED};>Not publicly disclosed</span>"}'
        f'{(" " + a(r.get("synopsis_url"), "Source")) if r.get("synopsis") and r.get("synopsis_url") and r.get("synopsis_url") != r.get("url") else ""}</td></tr>'
        for r in rows)
    return (f'<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;">'
            f'<tr><th {th} width="38%">Company, site and date</th><th {th}>Synopsis</th></tr>{body}</table></td></tr>')


def comp_rows(rows):
    return "".join(
        f'<tr><td style="padding:10px 0;border-bottom:1px solid {LINE};font-size:14px;color:{INK};">'
        f'{pill(r.get("area"), TEAL)} &nbsp;<b>{e(r.get("competitor"))}</b>{(" (" + e(r.get("group")) + ")") if r.get("group") else ""}: '
        f'{a(r.get("url"), r.get("latest_move"), INK)} <span style="color:{MUTED};font-size:12px;">({e(fmt(r.get("move_date")))})</span></td></tr>'
        for r in sorted(rows, key=lambda r: r.get("move_date", ""), reverse=True))


def by_signal_date(rows):
    return sorted(rows, key=lambda r: (SIG_ORDER.get(r.get("signal"), 3), "".join(chr(255 - ord(c)) for c in r.get("date", ""))))


def build(new_news, new_fda, new_comp, recap, total_new, last_sent, run, dash, first_run):
    day = TODAY.strftime("%a %d %b").replace(" 0", " ")
    high = [r for r in new_news if r.get("signal") == "High"]
    india = [r for r in new_fda if "India" in r.get("location", "")]

    if total_new:
        parts = []
        if high:
            parts.append(f"{len(high)} high-signal")
        if new_fda:
            parts.append(f"{len(new_fda)} FDA record{'s' if len(new_fda) != 1 else ''}")
        subject = f"Pivot Path Market Watch, {day}: {total_new} new update{'s' if total_new != 1 else ''}" + (f" ({', '.join(parts)})" if parts else "")
        since = "from the last two weeks" if first_run else f"since {fmt(last_sent.isoformat())}"
        lede = (f"{total_new} new item{'s' if total_new != 1 else ''} {since}: {len(new_news)} news, "
                f"{len(new_fda)} FDA 483s or warning letters ({len(india)} at Indian sites) and {len(new_comp)} competitor move{'s' if len(new_comp) != 1 else ''}.")
    else:
        subject = f"Pivot Path Market Watch, {day}: no new updates, last week's highlights"
        lede = f"Nothing new has come in since {fmt(last_sent.isoformat())}. Here are the main developments from the past week as a reminder."

    sections = []
    if total_new:
        if high:
            sections.append(section("Act on", "this week", "".join(news_block(r) for r in by_signal_date(high)), "High-signal items: direct competitor moves or regulation that changes a buying decision."))
        rest = [r for r in new_news if r.get("signal") != "High"]
        prod = [r for r in rest if r.get("area") in PRODUCTS]
        serv = [r for r in rest if r.get("area") in SERVICES]
        ai = [r for r in rest if r.get("area") not in PRODUCTS + SERVICES]
        sections.append(section("Products", "news", "".join(news_block(r) for r in by_signal_date(prod))))
        sections.append(section("Services", "news", "".join(news_block(r) for r in by_signal_date(serv))))
        sections.append(section("Pharma AI and", "regulation", "".join(news_block(r) for r in by_signal_date(ai))))
        sections.append(section("FDA 483s and", "warning letters", fda_table(new_fda), "Indian sites listed first."))
        sections.append(section("Competitor", "moves", comp_rows(new_comp)))
    else:
        sections.append(section("Last week's", "highlights", "".join(news_block(r) for r in by_signal_date(recap))))

    refreshed = fmt(run.get("refreshed"))
    html_body = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f1ea;font-family:'Open Sans',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f1ea;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:{WARM};border:1px solid {LINE};">
<tr><td style="height:5px;background:linear-gradient(90deg,#0F929D,#38AD66,#8BC33F);background-color:{OLIVE};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 0;">
<div style="font-size:22px;font-weight:700;color:{INK};">Pivot <span style="color:{OLIVE};">Path</span></div>
<h1 style="margin:16px 0 0;font-size:26px;line-height:1.15;text-transform:uppercase;color:{INK};">Market &amp; competitor<br><span style="color:{OLIVE};">watch</span></h1>
<p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:{INK};">{e(lede)}</p>
<p style="margin:16px 0 0;"><a href="{e(dash)}" style="display:inline-block;padding:10px 18px;background:{OLIVE};color:#ffffff;font-size:13px;font-weight:700;text-transform:uppercase;text-decoration:none;">Open the dashboard</a></p>
</td></tr>
{''.join(sections)}
<tr><td style="padding:24px 28px;font-size:12px;color:{MUTED};line-height:1.5;border-top:1px solid {LINE};">
Data last refreshed {e(refreshed)}. Ratings and "why it matters" notes are written by Claude from public sources; open the source link before using any figure in client material.<br>
Sent every Monday and Thursday morning. Internal use only.
</td></tr>
</table></td></tr></table></body></html>"""

    lines = [subject, "", lede, "", f"Dashboard: {dash}", ""]
    groups = [("High-signal", high), ("Other news", [r for r in new_news if r.get("signal") != "High"])] if total_new else [("Last week's highlights", recap)]
    for title, rows in groups:
        if rows:
            lines.append(title.upper())
            for r in by_signal_date(rows):
                lines.append(f"- [{r.get('area')}, {r.get('signal')}] {r.get('headline')} ({fmt(r.get('date'))}) {r.get('url', '')}")
            lines.append("")
    if total_new and new_fda:
        lines.append("FDA 483S AND WARNING LETTERS")
        for r in new_fda:
            lines.append(f"- {r.get('doc_type')}: {r.get('company')}, {r.get('location')} ({fmt(r.get('event_date'))}). {r.get('synopsis') or 'Not publicly disclosed.'}")
        lines.append("")
    if total_new and new_comp:
        lines.append("COMPETITOR MOVES")
        for r in new_comp:
            lines.append(f"- {r.get('competitor')} ({r.get('area')}): {r.get('latest_move')} ({fmt(r.get('move_date'))})")
    text_body = "\n".join(lines)

    for s in (subject, html_body, text_body):
        if "—" in s or "–" in s:
            subject, html_body, text_body = (x.replace("—", ", ").replace("–", " to ") for x in (subject, html_body, text_body))
            break
    return subject, html_body, text_body


def send(subject, html_body, text_body):
    user, pw = env("GMAIL_USER"), env("GMAIL_APP_PASSWORD").replace(" ", "")
    to = [x.strip() for x in env("MAIL_TO").replace(";", ",").split(",") if x.strip()]
    if not (user and pw and to):
        sys.exit("Missing GMAIL_USER, GMAIL_APP_PASSWORD or MAIL_TO secret.")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr(("Pivot Path Market Watch", user))
    msg["To"] = formataddr(("Market Watch subscribers", user))  # recipients go in Bcc so they don't see each other
    msg["Bcc"] = ", ".join(to)
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context()) as s:
        s.login(user, pw)
        s.send_message(msg)
    print(f"Sent '{subject}' to {len(to)} recipient(s).")


if __name__ == "__main__":
    main()
