#!/usr/bin/env python3
"""
Kindle CLI Dispatcher (Wireless SMTP or USB Sideload)
Sends EPUB or AZW3 files directly to Amazon Kindle from the command line.
"""

import sys
import os
import json
import smtplib
import argparse
import subprocess
import shutil
from email.message import EmailMessage

CONFIG_DIR = os.path.expanduser("~/.config/kindle")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def send_via_email(file_path, config, subject="Document for Kindle"):
    smtp_server = config.get("smtp_server", "smtp.gmail.com")
    smtp_port = int(config.get("smtp_port", 587))
    sender_email = config.get("sender_email")
    sender_password = config.get("sender_password")
    kindle_email = config.get("kindle_email")

    if not (sender_email and sender_password and kindle_email):
        print("Missing required SMTP configuration.")
        print(f"Please configure {CONFIG_PATH} with:")
        print(json.dumps({
            "smtp_server": "smtp.gmail.com",
            "smtp_port": 587,
            "sender_email": "your_email@gmail.com",
            "sender_password": "your_app_password",
            "kindle_email": "your_kindle@kindle.com"
        }, indent=2))
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender_email
    msg["To"] = kindle_email
    msg.set_content(f"Sent via Kindle CLI: {os.path.basename(file_path)}")

    with open(file_path, "rb") as f:
        file_data = f.read()
        file_name = os.path.basename(file_path)

    msg.add_attachment(file_data, maintype="application", subtype="octet-stream", filename=file_name)

    print(f"Connecting to {smtp_server}:{smtp_port}...")
    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()

        print(f"✅ Successfully sent '{file_name}' to {kindle_email}!")
        print("Amazon will process the file and deliver it over Wi-Fi in ~1–3 minutes.")
        return True, "Delivered to Kindle!"
    except (smtplib.SMTPAuthenticationError, smtplib.SMTPServerDisconnected) as e:
        err = "Gmail rejected your password. Google requires a 16-character App Password (not your normal password). Visit: https://myaccount.google.com/apppasswords"
        print(f"❌ {err}")
        return False, err
    except Exception as e:
        err = f"SMTP error: {e}"
        print(f"❌ {err}")
        return False, err

def send_via_usb(file_path):
    ebook_device = shutil.which("ebook-device") or "/opt/homebrew/bin/ebook-device"
    if not os.path.exists(ebook_device):
        print("Error: 'ebook-device' CLI not found. Is Calibre installed?")
        return False

    print("Checking for connected Kindle device...")
    res = subprocess.run([ebook_device, "info"], capture_output=True, text=True)
    if "Unable to find" in res.stdout or res.returncode != 0:
        print("No Kindle device detected over USB. Make sure it is unlocked and connected.")
        return False

    print("Device detected. Copying to /documents...")
    cmd = [ebook_device, "cp", file_path, "dev:/documents/"]
    cp_res = subprocess.run(cmd, capture_output=True, text=True)
    if cp_res.returncode == 0:
        print(f"Successfully copied {os.path.basename(file_path)} to Kindle!")
        return True
    else:
        print(f"USB transfer failed: {cp_res.stderr}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send EPUB or AZW3 to Kindle via Email or USB")
    parser.add_argument("file", help="Path to .epub or .azw3 file")
    parser.add_argument("--usb", action="store_true", help="Send via connected USB cable using Calibre")
    parser.add_argument("--subject", default="Document for Kindle", help="Email subject")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(f"Error: File not found: {args.file}")
        sys.exit(1)

    if args.usb:
        send_via_usb(args.file)
    else:
        cfg = load_config()
        send_via_email(args.file, cfg, subject=args.subject)
