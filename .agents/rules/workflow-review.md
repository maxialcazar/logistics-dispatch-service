---
trigger: always_on
---

# Protocolo Escalonado de Revisión (Sonnet vs. Opus)

1. **Implementación:** Planifica y ejecuta los cambios necesarios. Asegúrate de que compile y pasen los tests locales en terminal.
2. **Enrutamiento de Auditoría:**
   - **Sin revisión:** Cambios exclusivos en documentación (`.md`), comentarios o formato sin impacto lógico.
   - **Nivel Estándar (`@claude-reviewer` - Sonnet 5.5):** Úsalo por defecto para features cotidianas, endpoints, UI, scripts y bugfixes normales.
   - **Nivel Crítico (`@opus-auditor` - Opus 5.5):** Úsalo **únicamente** si se cumple alguna de estas condiciones:
     - El cambio toca arquitectura base, concurrencia/hilos, gestión manual de memoria, shaders/rendering o protocolos de comunicación/hardware.
     - Se modificaron más de 5 archivos acoplados en una misma tarea.
     - `@claude-reviewer` devolvió `ESTADO: REQUIERE_CAMBIOS` dos veces consecutivas y el problema persiste.
     - El usuario solicita explícitamente una revisión profunda o menciona `@opus-auditor`.
3. **Cierre:** Aplica las correcciones solicitadas por el auditor asignado (máximo 2 rondas) y entrega el resultado final al usuario solo tras recibir `ESTADO: APROBADO`.

## Optimización de Tokens

- **Lectura por rangos:** Usa `read_file` especificando líneas (`start_line` / `end_line`) siempre que busques una función puntual en archivos de más de 200 líneas.
- **Diffs acotados:** En `@claude-reviewer` y `@opus-auditor`, inspecciona primero `git diff --stat` y revisa únicamente los archivos modificados, evitando leer dependencias externas o carpetas de compilación (`build/`, `node_modules/`, `vcpkg_installed/`).
- **Hilos cortos:** Inicia un chat nuevo en Antigravity cada vez que cambies de feature o módulo; arrastrar un historial de 40 mensajes multiplica el costo de cada turno.
