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
