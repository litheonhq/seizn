"""Tests for the synchronous Seizn client."""

import pytest
from unittest.mock import patch, MagicMock
from seizn import Seizn, SeiznError, Memory, MemoryType, SearchMode, SearchResult


def mock_response(data, status_code=200):
    """Create a mock httpx response."""
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = data
    response.text = str(data)
    return response


class TestSeiznClient:
    """Test synchronous client."""

    def setup_method(self):
        self.client = Seizn(api_key="szn_test_key", base_url="https://test.seizn.com")

    def teardown_method(self):
        self.client.close()

    @patch("httpx.Client.request")
    def test_add_memory(self, mock_request):
        mock_request.return_value = mock_response({
            "memory": {
                "id": "mem-1",
                "content": "User likes Python",
                "memory_type": "preference",
                "tags": ["lang"],
                "namespace": "default",
                "importance": 5,
                "created_at": "2026-01-01T00:00:00Z",
            }
        })

        memory = self.client.add("User likes Python", memory_type=MemoryType.PREFERENCE, tags=["lang"])

        assert isinstance(memory, Memory)
        assert memory.id == "mem-1"
        assert memory.content == "User likes Python"
        assert memory.memory_type == "preference"

    @patch("httpx.Client.request")
    def test_get_memory(self, mock_request):
        mock_request.return_value = mock_response({
            "memory": {
                "id": "mem-1",
                "content": "test",
                "memory_type": "fact",
                "tags": [],
                "namespace": "default",
                "importance": 5,
                "created_at": "2026-01-01T00:00:00Z",
            }
        })

        memory = self.client.get("mem-1")
        assert memory.id == "mem-1"

    @patch("httpx.Client.request")
    def test_search_memories(self, mock_request):
        mock_request.return_value = mock_response({
            "results": [
                {
                    "id": "mem-1",
                    "content": "Python is great",
                    "memory_type": "fact",
                    "similarity": 0.95,
                    "tags": [],
                    "namespace": "default",
                }
            ]
        })

        results = self.client.search("Python", mode=SearchMode.VECTOR, limit=5)

        assert len(results) == 1
        assert isinstance(results[0], SearchResult)
        assert results[0].similarity == 0.95

    @patch("httpx.Client.request")
    def test_update_memory(self, mock_request):
        mock_request.return_value = mock_response({
            "memory": {
                "id": "mem-1",
                "content": "test",
                "memory_type": "fact",
                "tags": ["updated"],
                "namespace": "default",
                "importance": 8,
                "created_at": "2026-01-01T00:00:00Z",
            }
        })

        memory = self.client.update("mem-1", tags=["updated"], importance=8)
        assert memory.importance == 8

    @patch("httpx.Client.request")
    def test_delete_memory(self, mock_request):
        mock_request.return_value = mock_response({"deleted": True})
        result = self.client.delete("mem-1")
        assert result is True

    @patch("httpx.Client.request")
    def test_delete_many(self, mock_request):
        mock_request.return_value = mock_response({"deleted": 3})
        count = self.client.delete_many(["mem-1", "mem-2", "mem-3"])
        assert count == 3

    @patch("httpx.Client.request")
    def test_extract(self, mock_request):
        mock_request.return_value = mock_response({
            "extracted": [
                {"content": "User likes dark mode", "memory_type": "preference", "confidence": 0.9}
            ]
        })

        results = self.client.extract("I really prefer dark mode for coding")
        assert len(results) == 1
        assert results[0].confidence == 0.9

    @patch("httpx.Client.request")
    def test_query_rag(self, mock_request):
        mock_request.return_value = mock_response({
            "response": "Based on your memories, you prefer Python.",
            "memories_used": [
                {
                    "id": "mem-1",
                    "content": "User likes Python",
                    "similarity": 0.9,
                    "tags": [],
                    "namespace": "default",
                }
            ],
            "model_used": "haiku",
        })

        result = self.client.query("What do I like?")
        assert "Python" in result.response
        assert len(result.memories_used) == 1

    @patch("httpx.Client.request")
    def test_export_memories(self, mock_request):
        mock_request.return_value = mock_response({
            "memories": [],
            "count": 0,
            "version": "1.0",
        })

        result = self.client.export_memories()
        assert "memories" in result

    @patch("httpx.Client.request")
    def test_error_handling_4xx(self, mock_request):
        mock_request.return_value = mock_response({"error": "Not found"}, status_code=404)

        with pytest.raises(SeiznError) as exc_info:
            self.client.get("nonexistent")

        assert exc_info.value.status_code == 404

    @patch("httpx.Client.request")
    def test_context_manager(self, mock_request):
        mock_request.return_value = mock_response({
            "memory": {
                "id": "mem-1",
                "content": "test",
                "memory_type": "fact",
                "tags": [],
                "namespace": "default",
                "importance": 5,
                "created_at": "2026-01-01T00:00:00Z",
            }
        })

        with Seizn(api_key="szn_test") as client:
            memory = client.add("test")
            assert memory.id == "mem-1"


class TestSpringMixin:
    """Test Spring mixin methods on the sync client."""

    def setup_method(self):
        self.client = Seizn(api_key="szn_test_key", base_url="https://test.seizn.com")

    def teardown_method(self):
        self.client.close()

    @patch("httpx.Client.request")
    def test_get_edges(self, mock_request):
        mock_request.return_value = mock_response({
            "edges": [
                {
                    "id": "edge-1",
                    "srcMemoryId": "a",
                    "dstMemoryId": "b",
                    "edgeType": "supports",
                    "weight": 0.8,
                    "direction": "outgoing",
                }
            ]
        })

        edges = self.client.get_edges("a")
        assert len(edges) == 1
        assert edges[0].edge_type == "supports"

    @patch("httpx.Client.request")
    def test_create_edge(self, mock_request):
        mock_request.return_value = mock_response({
            "edge": {
                "id": "edge-1",
                "srcMemoryId": "a",
                "dstMemoryId": "b",
                "edgeType": "relates_to",
                "weight": 1.0,
                "direction": "outgoing",
            }
        })

        edge = self.client.create_edge("a", "b")
        assert edge.id == "edge-1"

    @patch("httpx.Client.request")
    def test_get_temporal_status(self, mock_request):
        mock_request.return_value = mock_response({
            "active": 100,
            "expired": 5,
            "superseded": 10,
            "expiringSoon": 3,
        })

        status = self.client.get_temporal_status()
        assert status.active == 100
        assert status.expiring_soon == 3

    @patch("httpx.Client.request")
    def test_list_ingestion_rules(self, mock_request):
        mock_request.return_value = mock_response({
            "rules": [
                {"id": "rule-1", "name": "Block PII", "action": "redact"}
            ]
        })

        rules = self.client.list_ingestion_rules()
        assert len(rules) == 1
        assert rules[0].action == "redact"
