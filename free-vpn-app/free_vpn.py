#!/usr/bin/env python3
"""
Free VPN - تطبيق VPN مجاني وسهل
=================================

A small desktop VPN client (Windows / Linux / macOS) that:
  * downloads the list of free public VPN servers run by volunteers of the
    VPN Gate academic project (University of Tsukuba, Japan),
  * lets you pick a country (or "best server" automatically),
  * connects through OpenVPN with one click.

Requirements: Python 3.8+ (standard library only) and OpenVPN installed.
Run as Administrator (Windows) or with sudo (Linux / macOS).
"""

import base64
import csv
import io
import json
import os
import platform
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

APP_NAME = "Free VPN"
API_URLS = [
    "https://www.vpngate.net/api/iphone/",
    "http://www.vpngate.net/api/iphone/",
]
CACHE_FILE = os.path.join(os.path.expanduser("~"), ".free_vpn_servers.json")
BEST = "⭐ أفضل سيرفر تلقائي (Best)"

# Extra options appended to every config so the old VPN Gate configs work with
# modern OpenVPN 2.5/2.6 + OpenSSL 3.
COMPAT_OPTIONS = """
# --- added by Free VPN for compatibility with modern OpenVPN ---
data-ciphers AES-128-CBC:AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-256-CBC
data-ciphers-fallback AES-128-CBC
tls-cipher DEFAULT:@SECLEVEL=0
connect-retry-max 2
"""


# --------------------------------------------------------------------------
# Server list
# --------------------------------------------------------------------------
def parse_vpngate_csv(text):
    """Parse the VPN Gate API CSV into a list of server dicts."""
    lines = [l for l in text.splitlines() if l and not l.startswith("*")]
    if not lines:
        return []
    lines[0] = lines[0].lstrip("#")
    servers = []
    for row in csv.DictReader(io.StringIO("\n".join(lines))):
        cfg = row.get("OpenVPN_ConfigData_Base64") or ""
        if not cfg:
            continue

        def num(key):
            try:
                return int(row.get(key) or 0)
            except ValueError:
                return 0

        servers.append({
            "host": row.get("HostName", ""),
            "ip": row.get("IP", ""),
            "score": num("Score"),
            "ping": num("Ping"),
            "speed": num("Speed"),  # bits per second
            "country": row.get("CountryLong", "") or "Unknown",
            "cc": row.get("CountryShort", ""),
            "sessions": num("NumVpnSessions"),
            "config_b64": cfg,
        })
    servers.sort(key=lambda s: s["score"], reverse=True)
    return servers


def fetch_servers(timeout=20):
    """Download the server list, falling back to the local cache."""
    last_error = None
    for url in API_URLS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FreeVPN/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                text = r.read().decode("utf-8", errors="replace")
            servers = parse_vpngate_csv(text)
            if servers:
                try:
                    with open(CACHE_FILE, "w", encoding="utf-8") as f:
                        json.dump(servers, f)
                except OSError:
                    pass
                return servers, False
        except Exception as e:  # noqa: BLE001 - try the next mirror
            last_error = e
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f), True
    raise RuntimeError(f"تعذر تحميل قائمة السيرفرات: {last_error}")


def build_config(server, workdir):
    """Write the .ovpn file for a server and return its path."""
    cfg = base64.b64decode(server["config_b64"]).decode("utf-8", errors="replace")
    cfg = cfg.replace("\r\n", "\n")
    lines = []
    for line in cfg.split("\n"):
        stripped = line.strip()
        # Old option, removed in OpenVPN 2.6 - drop it.
        if stripped.startswith("cipher ") or stripped.startswith("ncp-"):
            lines.append("# " + line)
            continue
        if stripped == "auth-user-pass":
            auth = os.path.join(workdir, "auth.txt")
            with open(auth, "w") as f:
                f.write("vpn\nvpn\n")  # VPN Gate public credentials
            # Forward slashes: OpenVPN treats "\\" as an escape inside quotes.
            line = 'auth-user-pass "%s"' % auth.replace("\\", "/")
        lines.append(line)
    path = os.path.join(workdir, "server.ovpn")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + COMPAT_OPTIONS)
    return path


# --------------------------------------------------------------------------
# OpenVPN process
# --------------------------------------------------------------------------
def find_openvpn():
    exe = shutil.which("openvpn")
    if exe:
        return exe
    candidates = [
        r"C:\Program Files\OpenVPN\bin\openvpn.exe",
        r"C:\Program Files (x86)\OpenVPN\bin\openvpn.exe",
        "/usr/sbin/openvpn",
        "/usr/local/sbin/openvpn",
        "/opt/homebrew/sbin/openvpn",
        "/usr/local/opt/openvpn/sbin/openvpn",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def is_admin():
    if platform.system() == "Windows":
        try:
            import ctypes
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:  # noqa: BLE001
            return False
    return os.geteuid() == 0


def relaunch_as_admin_windows():
    import ctypes
    script = os.path.abspath(sys.argv[0])
    params = " ".join(f'"{a}"' for a in sys.argv[1:])
    if getattr(sys, "frozen", False):  # PyInstaller exe
        exe, args = sys.executable, params
    else:
        exe, args = sys.executable, f'"{script}" {params}'
    return ctypes.windll.shell32.ShellExecuteW(None, "runas", exe, args, None, 1) > 32


class VPNConnection:
    def __init__(self, on_log, on_state):
        self.proc = None
        self.on_log = on_log
        self.on_state = on_state
        self.workdir = tempfile.mkdtemp(prefix="freevpn_")

    def connect(self, server):
        exe = find_openvpn()
        if not exe:
            raise RuntimeError(
                "برنامج OpenVPN غير مثبت.\n"
                "Windows: نزّله من https://openvpn.net/community-downloads/\n"
                "Linux: sudo apt install openvpn\n"
                "macOS: brew install openvpn"
            )
        cfg = build_config(server, self.workdir)
        kwargs = {}
        if platform.system() == "Windows":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        self.proc = subprocess.Popen(
            [exe, "--config", cfg, "--verb", "3"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            cwd=self.workdir, text=True, errors="replace", **kwargs,
        )
        self.on_state("connecting")
        threading.Thread(target=self._reader, args=(self.proc,), daemon=True).start()

    def _reader(self, proc):
        for line in proc.stdout:
            line = line.rstrip()
            self.on_log(line)
            if "Initialization Sequence Completed" in line:
                self.on_state("connected")
            elif "AUTH_FAILED" in line or "Exiting due to fatal error" in line:
                self.on_state("failed")
        proc.wait()
        if proc is self.proc:
            self.proc = None
            self.on_state("disconnected")

    def disconnect(self):
        proc, self.proc = self.proc, None
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        self.on_state("disconnected")

    @property
    def active(self):
        return self.proc is not None and self.proc.poll() is None


# --------------------------------------------------------------------------
# GUI
# --------------------------------------------------------------------------
def run_gui():
    import tkinter as tk
    from tkinter import messagebox, ttk

    root = tk.Tk()
    root.title(f"{APP_NAME} - VPN مجاني")
    root.geometry("460x560")
    root.minsize(420, 500)

    BG, CARD, FG, MUTED = "#0f172a", "#1e293b", "#f1f5f9", "#94a3b8"
    GREEN, RED, AMBER, BLUE = "#22c55e", "#ef4444", "#f59e0b", "#3b82f6"
    root.configure(bg=BG)

    events = queue.Queue()
    state = {"servers": [], "current": None, "status": "disconnected", "tried": set(),
             "attempts": 0}

    conn = VPNConnection(
        on_log=lambda l: events.put(("log", l)),
        on_state=lambda s: events.put(("state", s)),
    )

    # ---- widgets ----
    tk.Label(root, text="🛡️ Free VPN", font=("Segoe UI", 22, "bold"),
             bg=BG, fg=FG).pack(pady=(18, 2))
    tk.Label(root, text="سيرفرات مجانية من مشروع VPN Gate", font=("Segoe UI", 10),
             bg=BG, fg=MUTED).pack()

    status_lbl = tk.Label(root, text="● غير متصل", font=("Segoe UI", 14, "bold"),
                          bg=BG, fg=RED)
    status_lbl.pack(pady=(16, 4))
    server_lbl = tk.Label(root, text="", font=("Segoe UI", 10), bg=BG, fg=MUTED)
    server_lbl.pack()

    btn = tk.Button(root, text="اتصال", font=("Segoe UI", 16, "bold"), width=12,
                    height=2, bg=GREEN, fg="white", activebackground=GREEN,
                    relief="flat", cursor="hand2")
    btn.pack(pady=18)

    card = tk.Frame(root, bg=CARD, padx=14, pady=12)
    card.pack(fill="x", padx=18)
    tk.Label(card, text="اختر الدولة:", font=("Segoe UI", 11), bg=CARD,
             fg=FG).pack(anchor="e")
    country_var = tk.StringVar(value=BEST)
    country_box = ttk.Combobox(card, textvariable=country_var, state="readonly",
                               font=("Segoe UI", 11))
    country_box.pack(fill="x", pady=6)
    info_lbl = tk.Label(card, text="جاري تحميل السيرفرات...", font=("Segoe UI", 9),
                        bg=CARD, fg=MUTED)
    info_lbl.pack(anchor="e")
    refresh_btn = tk.Button(card, text="🔄 تحديث القائمة", font=("Segoe UI", 9),
                            bg=BLUE, fg="white", relief="flat", cursor="hand2")
    refresh_btn.pack(anchor="w", pady=(6, 0))

    log_box = tk.Text(root, height=8, bg="#020617", fg="#64748b",
                      font=("Consolas", 8), relief="flat", wrap="word")
    log_box.pack(fill="both", expand=True, padx=18, pady=14)

    def log(msg):
        log_box.insert("end", msg + "\n")
        log_box.see("end")
        if int(log_box.index("end").split(".")[0]) > 400:
            log_box.delete("1.0", "100.0")

    # ---- logic ----
    def countries():
        seen = {}
        for s in state["servers"]:
            seen[s["country"]] = seen.get(s["country"], 0) + 1
        return [BEST] + [f"{c} ({n})" for c, n in sorted(seen.items())]

    def pick_server():
        choice = country_var.get()
        pool = state["servers"]
        if choice != BEST:
            name = choice.rsplit(" (", 1)[0]
            pool = [s for s in pool if s["country"] == name]
        fresh = [s for s in pool if s["host"] not in state["tried"]]
        if not fresh:
            state["tried"].clear()
            fresh = pool
        return fresh[0] if fresh else None

    def load_servers():
        info_lbl.config(text="جاري تحميل السيرفرات...")
        refresh_btn.config(state="disabled")

        def work():
            try:
                servers, cached = fetch_servers()
                events.put(("servers", (servers, cached)))
            except Exception as e:  # noqa: BLE001
                events.put(("error", str(e)))
        threading.Thread(target=work, daemon=True).start()

    def set_status(s):
        state["status"] = s
        if s == "connected":
            status_lbl.config(text="● متصل ✔", fg=GREEN)
            btn.config(text="قطع الاتصال", bg=RED, activebackground=RED)
            state["tried"].clear()
            state["attempts"] = 0
        elif s == "connecting":
            status_lbl.config(text="● جاري الاتصال...", fg=AMBER)
            btn.config(text="إلغاء", bg=AMBER, activebackground=AMBER)
        else:
            status_lbl.config(text="● غير متصل", fg=RED)
            btn.config(text="اتصال", bg=GREEN, activebackground=GREEN)

    def connect():
        state["attempts"] += 1
        if state["attempts"] > 10:
            state["current"] = None
            set_status("disconnected")
            messagebox.showwarning(APP_NAME, "تعذر الاتصال بعد عدة محاولات.\n"
                                             "جرّب دولة أخرى أو اضغط تحديث القائمة.")
            return
        server = pick_server()
        if not server:
            messagebox.showwarning(APP_NAME, "لا توجد سيرفرات متاحة، اضغط تحديث القائمة.")
            return
        state["current"] = server
        state["tried"].add(server["host"])
        mbps = server["speed"] / 1_000_000
        server_lbl.config(text=f"{server['country']} • {server['ip']} • "
                               f"{server['ping']}ms • {mbps:.1f} Mbps")
        log(f">>> Connecting to {server['host']} ({server['ip']})")
        try:
            conn.connect(server)
        except Exception as e:  # noqa: BLE001
            messagebox.showerror(APP_NAME, str(e))
            set_status("disconnected")

    def on_button():
        if state["status"] in ("connected", "connecting"):
            state["current"] = None
            conn.disconnect()
        else:
            state["attempts"] = 0
            connect()

    btn.config(command=on_button)
    refresh_btn.config(command=load_servers)

    connect_started = {"t": 0}

    def pump():
        try:
            while True:
                kind, data = events.get_nowait()
                if kind == "log":
                    log(data)
                elif kind == "state":
                    prev = state["status"]
                    if data == "connecting":
                        connect_started["t"] = time.time()
                    if data in ("failed", "disconnected") and prev == "connecting" \
                            and state["current"] is not None:
                        # The server didn't work: try the next one automatically.
                        log(">>> السيرفر لم يستجب، تجربة سيرفر آخر...")
                        conn.disconnect()
                        set_status("disconnected")
                        events.queue.clear()
                        root.after(500, connect)
                        continue
                    set_status("disconnected" if data == "failed" else data)
                elif kind == "servers":
                    servers, cached = data
                    state["servers"] = servers
                    country_box["values"] = countries()
                    extra = " (نسخة محفوظة)" if cached else ""
                    info_lbl.config(text=f"{len(servers)} سيرفر متاح{extra}")
                    refresh_btn.config(state="normal")
                elif kind == "error":
                    info_lbl.config(text="فشل التحميل")
                    refresh_btn.config(state="normal")
                    messagebox.showerror(APP_NAME, data)
        except queue.Empty:
            pass
        # Give up on a server that takes too long to connect.
        if state["status"] == "connecting" and time.time() - connect_started["t"] > 25:
            log(">>> انتهت المهلة، تجربة سيرفر آخر...")
            conn.disconnect()
            events.queue.clear()
            set_status("disconnected")
            root.after(300, connect)
        root.after(200, pump)

    def on_close():
        state["current"] = None
        conn.disconnect()
        shutil.rmtree(conn.workdir, ignore_errors=True)
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)

    if not is_admin():
        if platform.system() == "Windows":
            if messagebox.askyesno(APP_NAME, "التطبيق يحتاج صلاحيات المسؤول (Administrator).\n"
                                             "هل تريد إعادة التشغيل كمسؤول؟"):
                if relaunch_as_admin_windows():
                    root.destroy()
                    return
        else:
            messagebox.showwarning(APP_NAME, "شغّل التطبيق بصلاحيات root:\n"
                                             f"sudo python3 {os.path.basename(sys.argv[0])}")

    load_servers()
    pump()
    root.mainloop()


# --------------------------------------------------------------------------
# CLI (no GUI): python free_vpn.py --list | --connect [COUNTRY_CODE]
# --------------------------------------------------------------------------
def run_cli(args):
    servers, cached = fetch_servers()
    if args[0] == "--list":
        print(f"{'#':>3}  {'Country':<20} {'IP':<16} {'Ping':>5} {'Mbps':>7}")
        for i, s in enumerate(servers[:40], 1):
            print(f"{i:>3}  {s['country'][:20]:<20} {s['ip']:<16} "
                  f"{s['ping']:>5} {s['speed'] / 1e6:>7.1f}")
        return
    cc = args[1].upper() if len(args) > 1 else None
    pool = [s for s in servers if not cc or s["cc"].upper() == cc]
    if not pool:
        sys.exit(f"No servers for country code {cc}")
    done = threading.Event()
    conn = VPNConnection(on_log=print, on_state=lambda s: s == "disconnected" and done.set())
    conn.connect(pool[0])
    print(f"Connecting to {pool[0]['country']} {pool[0]['ip']} ... (Ctrl+C to stop)")
    try:
        done.wait()
    except KeyboardInterrupt:
        conn.disconnect()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ("--list", "--connect"):
        run_cli(sys.argv[1:])
    else:
        run_gui()
