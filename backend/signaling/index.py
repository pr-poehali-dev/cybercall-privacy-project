"""
Сигнальный сервер для WebRTC видеозвонков.
Хранит SDP offer/answer и ICE candidates для P2P соединения между двумя участниками.
"""
import json
import os
import random
import string
import psycopg2


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def handler(event: dict, context) -> dict:
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": cors, "body": ""}

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")

    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    conn = get_conn()
    cur = conn.cursor()

    try:
        # Создать новую сессию
        if method == "POST" and action == "create":
            session_id = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
            cur.execute(
                "INSERT INTO call_sessions (id, status) VALUES (%s, 'waiting') RETURNING id",
                (session_id,)
            )
            conn.commit()
            return {
                "statusCode": 200,
                "headers": cors,
                "body": json.dumps({"session_id": session_id}),
            }

        # Отправить SDP offer (caller)
        elif method == "POST" and action == "offer":
            sid = body.get("session_id")
            sdp = body.get("sdp")
            cur.execute(
                "UPDATE call_sessions SET offer_sdp=%s, status='waiting', updated_at=NOW() WHERE id=%s",
                (sdp, sid)
            )
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        # Отправить SDP answer (callee)
        elif method == "POST" and action == "answer":
            sid = body.get("session_id")
            sdp = body.get("sdp")
            cur.execute(
                "UPDATE call_sessions SET answer_sdp=%s, status='connected', updated_at=NOW() WHERE id=%s",
                (sdp, sid)
            )
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        # Добавить ICE candidate
        elif method == "POST" and action == "ice":
            sid = body.get("session_id")
            candidate = body.get("candidate")
            role = body.get("role", "offer")  # "offer" или "answer"
            field = "offer_ice" if role == "offer" else "answer_ice"
            cur.execute(
                f"UPDATE call_sessions SET {field} = {field} || %s::jsonb, updated_at=NOW() WHERE id=%s",
                (json.dumps([candidate]), sid)
            )
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        # Получить состояние сессии (polling)
        elif method == "GET" and action == "poll":
            sid = params.get("session_id")
            cur.execute(
                "SELECT offer_sdp, answer_sdp, offer_ice, answer_ice, status FROM call_sessions WHERE id=%s",
                (sid,)
            )
            row = cur.fetchone()
            if not row:
                return {"statusCode": 404, "headers": cors, "body": json.dumps({"error": "not_found"})}
            offer_sdp, answer_sdp, offer_ice, answer_ice, status = row
            return {
                "statusCode": 200,
                "headers": cors,
                "body": json.dumps({
                    "offer_sdp": offer_sdp,
                    "answer_sdp": answer_sdp,
                    "offer_ice": offer_ice or [],
                    "answer_ice": answer_ice or [],
                    "status": status,
                }),
            }

        # Завершить сессию
        elif method == "POST" and action == "end":
            sid = body.get("session_id")
            cur.execute(
                "UPDATE call_sessions SET status='ended', updated_at=NOW() WHERE id=%s",
                (sid,)
            )
            conn.commit()
            return {"statusCode": 200, "headers": cors, "body": json.dumps({"ok": True})}

        else:
            return {"statusCode": 400, "headers": cors, "body": json.dumps({"error": "unknown_action"})}

    finally:
        cur.close()
        conn.close()