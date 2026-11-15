# Messages: FRONTEND → BACKEND (append-only)

Frontend appends messages here. Backend replies under each message and updates its Status.

Format:
```
### #<n> [QUESTION|CHANGE-REQUEST|FYI|BLOCKER] HH:MM — <title>
<body>
Status: OPEN
```
Reply format (appended by backend under the message):
```
Reply HH:MM: <text>
Status: ACK | DONE
```

---
