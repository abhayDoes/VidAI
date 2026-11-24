import json
from typing import List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    def __init__(self):
        # Map project_id -> list of active WebSockets
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Global connections without specific project
        self.global_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, project_id: str = None):
        await websocket.accept()
        if project_id:
            if project_id not in self.active_connections:
                self.active_connections[project_id] = []
            self.active_connections[project_id].append(websocket)
        else:
            self.global_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str = None):
        if project_id and project_id in self.active_connections:
            if websocket in self.active_connections[project_id]:
                self.active_connections[project_id].remove(websocket)
        if websocket in self.global_connections:
            self.global_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any], project_id: str = None):
        data = json.dumps(message)
        targets = []
        if project_id and project_id in self.active_connections:
            targets.extend(self.active_connections[project_id])
        targets.extend(self.global_connections)

        for connection in targets:
            try:
                await connection.send_text(data)
            except Exception:
                pass


ws_manager = ConnectionManager()

