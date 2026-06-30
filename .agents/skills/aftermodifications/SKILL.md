---
name: aftermodifications
description: Regole da eseguire ogni volta che si finisce di effettuare una modifica nel codice.
---
# Workspace Rules & Skills

Ogni volta che finisci di effettuare una modifica nel codice:
1. **Controllo dei Task**: Cerca nel file `tasks.md` se la modifica effettuata era prevista come attività (in To Do o In Progress). Se presente, spostala nella sezione Completate e segnalala come completata modificando la riga in `- [x]`.
2. **Traduzione delle Stringhe**: Se sono state aggiunte nuove stringhe traducibili nel codice (es. racchiuse in `_()`), procedi alla loro traduzione e ricompila il file .mo.
3. **Riavvio del Docker**: Esegui il comando docker compose down && docker compose up -d --build
4. **Commit automatico**: Non eseguire il commit automatico.

