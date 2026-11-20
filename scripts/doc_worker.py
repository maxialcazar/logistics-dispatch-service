import os
import json
import argparse
import subprocess
import urllib.request
from pathlib import Path

REPO_DIR = Path(__file__).resolve().parent.parent
LOCAL_ENV = REPO_DIR / ".env"

DEPLOY_BASE_URL = "https://api-sf1.deploy.com/api/v1/chat/completions"
DEPLOY_MODEL = "deepseek-ai/deepseek-v4.1-flash-1017"


def load_deploy_key() -> str:
    if LOCAL_ENV.exists():
        for line in LOCAL_ENV.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DEPLOY_API_KEY="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val
    return os.getenv("DEPLOY_API_KEY", "")


def call_deploy(system_prompt: str, user_prompt: str, api_key: str) -> str:
    payload = {
        "model": DEPLOY_MODEL,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    req = urllib.request.Request(
        DEPLOY_BASE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "LDS-TechWriter/2.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()


def get_git_diff() -> str:
    staged = subprocess.run(
        ["git", "-C", str(REPO_DIR), "diff", "--cached", "--stat"],
        capture_output=True, text=True
    ).stdout.strip()
    if staged:
        diff_detail = subprocess.run(
            ["git", "-C", str(REPO_DIR), "diff", "--cached", "-U2"],
            capture_output=True, text=True
        ).stdout[:6000]
        return f"STAGED STAT:\n{staged}\n\nDIFF:\n{diff_detail}"

    unstaged = subprocess.run(
        ["git", "-C", str(REPO_DIR), "diff", "--stat"],
        capture_output=True, text=True
    ).stdout.strip()
    diff_detail = subprocess.run(
        ["git", "-C", str(REPO_DIR), "diff", "-U2"],
        capture_output=True, text=True
    ).stdout[:6000]
    return f"UNSTAGED STAT:\n{unstaged}\n\nDIFF:\n{diff_detail}"


def main():
    parser = argparse.ArgumentParser(description="Worker de redacción técnica para LDS vía Deploy.com")
    parser.add_argument("--modo", required=True, choices=["commit", "tasks", "docs"])
    parser.add_argument("--input", default="", help="Texto crudo o ruta a archivo de entrada")
    parser.add_argument("--append-tasks", action="store_true", help="Agrega el resultado directamente al final de TASKS.md")
    args = parser.parse_args()

    api_key = load_deploy_key()
    if not api_key:
        raise SystemExit("Falta DEPLOY_API_KEY en el archivo .env de logistics-dispatch-service o en variables de entorno.")

    contenido_entrada = args.input
    if args.input and Path(args.input).exists():
        contenido_entrada = Path(args.input).read_text(encoding="utf-8")

    if args.modo == "commit":
        diff_txt = contenido_entrada or get_git_diff()
        sys_p = (
            "Eres un ingeniero senior redactor de commits. Genera un mensaje de commit semántico "
            "(feat:, fix:, ui:, perf:, refactor:) en español claro y conciso. "
            "Primera línea máximo 72 caracteres describiendo el beneficio funcional; luego hasta 3 bullets breves. "
            "Devuelve SOLO el texto del commit sin bloques markdown."
        )
        resultado = call_deploy(sys_p, f"Genera el commit para estos cambios:\n\n{diff_txt}", api_key)
        print(resultado)

    elif args.modo == "tasks":
        sys_p = (
            "Eres un Tech Lead organizando el backlog de Logistics Dispatch Service (LDS). "
            "Convierte el diagnóstico recibido en una lista estricta de tareas Markdown accionables "
            "con formato '- [ ] **[Ruta/Archivo]**: Descripción técnica precisa del cambio esperado'. "
            "No agregues introducciones ni despedidas."
        )
        resultado = call_deploy(sys_p, contenido_entrada, api_key)
        if args.append_tasks:
            tasks_file = REPO_DIR / "TASKS.md"
            prev = tasks_file.read_text(encoding="utf-8") if tasks_file.exists() else "# Backlog de Tareas — LDS\n"
            bloque = f"\n## Mejoras Generadas (@tech-writer)\n{resultado}\n"
            tasks_file.write_text(prev.rstrip() + "\n" + bloque, encoding="utf-8")
            print(f"Tareas agregadas a {tasks_file}")
        else:
            print(resultado)

    elif args.modo == "docs":
        sys_p = (
            "Eres el redactor de documentación técnica de Logistics Dispatch Service (LDS). "
            "Escribe documentación Markdown clara, estructurada y directa en español profesional."
        )
        resultado = call_deploy(sys_p, contenido_entrada, api_key)
        print(resultado)


if __name__ == "__main__":
    main()