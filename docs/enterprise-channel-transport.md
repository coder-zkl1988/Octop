# Enterprise channel transport

Octop can receive an internal push request from Tabby Enterprise and route it
through the existing Agent channel runtime. The endpoint does not create a
second channel implementation; `Gateway` and `ChannelManager` still own
channel lookup, session locking, text cleanup, and delivery.

Set `OCTOP_ENTERPRISE_INTERNAL_TOKEN` in the Octop process. Enterprise sends:

```http
POST /api/internal/enterprise/channel-push
X-Octop-Enterprise-Token: <shared-token>
Content-Type: application/json
```

```json
{
  "agent_id": "agent-id",
  "channel_id": "channel-id",
  "subject_id": "recipient-id",
  "text": "notification text",
  "chat_type": "dm",
  "metadata": {}
}
```

The endpoint returns `{"delivered": true}` after the existing gateway push
path accepts the message. Enterprise should use `transport: "octop"` in a
platform notification channel and provide `TABBY_OCTOP_URL` plus
`TABBY_OCTOP_ENTERPRISE_TOKEN` to the control-plane process.
