#!/usr/bin/env python3
"""Verify the owner's SMTP credentials and store them privately in Firebase.

Run interactively in Cloud Shell. Never pass passwords as command-line arguments.
This utility neither sends messages nor deploys functions.
"""
import getpass
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import warnings

PROJECT = "helicopteros-personales"
SECRET = "HP_PROSPECT_EMAIL_CONFIG"
ROOT = Path(__file__).resolve().parents[1]

VERIFY = r"""
const fs = require('node:fs');
const {configuration} = require('./functions/prospect-email');
const nodemailer = require('./functions/node_modules/nodemailer');
(async () => {
  const cfg = configuration(fs.readFileSync(0, 'utf8'));
  const transport = nodemailer.createTransport(cfg.transport);
  try { await transport.verify(); process.stdout.write('SMTP_OK'); }
  catch (error) {
    const known = ['EAUTH', 'ETLS', 'EDNS', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET'];
    process.stdout.write(known.includes(error.code) ? error.code : 'SMTP_ERROR');
    process.exitCode = 1;
  } finally { transport.close(); }
})().catch(() => { process.stdout.write('CONFIG_ERROR'); process.exitCode = 1; });
"""


def verify(config):
    result = subprocess.run(
        ["node", "-e", VERIFY], input=json.dumps(config), text=True,
        capture_output=True, cwd=ROOT, timeout=75, check=False,
    )
    if result.returncode == 0 and result.stdout == "SMTP_OK":
        return
    if result.stdout == "EAUTH":
        raise RuntimeError("El servidor rechazó el usuario o la clave. Revisa el acceso al correo o su credencial de aplicación.")
    if result.stdout in ("ETLS", "ESOCKET"):
        raise RuntimeError("No se pudo validar la conexión segura. Revisa el certificado SMTP con el proveedor; no desactives TLS.")
    raise RuntimeError("No se pudo verificar el correo. Revisa servidor, puerto, acceso SMTP y conexión con el proveedor.")


def save_secret(config):
    # Both the credential file and any CLI diagnostic logs stay outside the repo.
    with tempfile.TemporaryDirectory(prefix="hp-correo-privado-") as directory:
        path = Path(directory) / "config.json"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(config, handle)
        result = subprocess.run(
            ["npx", "-y", "firebase-tools@latest", "functions:secrets:set", SECRET,
             "--project", PROJECT, "--data-file", str(path), "--non-interactive"],
            cwd=directory, text=True, capture_output=True, timeout=180, check=False,
        )
        if result.returncode:
            raise RuntimeError("El correo se verificó, pero Firebase no confirmó el secreto. Revisa tu sesión y permisos del proyecto y vuelve a ejecutar este asistente.")


def main():
    if len(sys.argv) > 1:
        print("Uso: python3 scripts/configure-prospect-email.py\nLa clave se solicita de forma oculta, nunca como argumento.")
        return 0 if sys.argv[1] in ("--help", "-h") else 1
    if not sys.stdin.isatty():
        raise RuntimeError("Abre una terminal interactiva para ingresar la clave sin mostrarla.")
    if not shutil.which("node") or not shutil.which("npx"):
        raise RuntimeError("Necesitas Node.js y npm. Puedes usar Google Cloud Shell.")
    if not (ROOT / "functions/node_modules/nodemailer").exists():
        raise RuntimeError("Primero ejecuta: npm --prefix functions install")
    print("Proyecto: " + PROJECT)
    print("Se comprobará el acceso y se guardará la credencial en el secreto privado de Firebase.")
    print("Este paso no envía correos ni activa la automatización.")
    mailbox = input("Correo remitente y primer destinatario (información): ").strip()
    school = input("Segundo destinatario (correo de la escuela): ").strip()
    host = input("Servidor SMTP indicado por el proveedor: ").strip()
    print("Puerto: 465 | SSL/TLS")
    user = input("Usuario del correo [" + mailbox + "]: ").strip() or mailbox
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        password = getpass.getpass("Clave del correo o contraseña de aplicación (no se mostrará): ")
    if not password:
        raise RuntimeError("No se ingresó una clave; no se guardó nada.")
    config = {"host": host, "port": 465, "user": user, "password": password, "from": mailbox, "recipients": [mailbox, school]}
    print("Comprobando la conexión cifrada y el acceso al correo…")
    verify(config)
    print("Acceso al correo verificado. Guardando el secreto…")
    save_secret(config)
    print("Correo conectado y secreto guardado. Falta desplegar la función para activar los avisos.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print("\nOperación interrumpida. No compartas la clave ni archivos temporales.", file=sys.stderr)
        sys.exit(1)
    except (RuntimeError, subprocess.TimeoutExpired, getpass.GetPassWarning) as error:
        message = str(error) if isinstance(error, RuntimeError) else "No se completó la operación de forma segura. Vuelve a intentarlo desde Cloud Shell."
        print(message, file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("No se completó la configuración. Revisa los requisitos y vuelve a intentarlo.", file=sys.stderr)
        sys.exit(1)
