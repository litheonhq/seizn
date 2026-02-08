"""Tests for the asynchronous Seizn client."""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from seizn import AsyncSeizn, SeiznAsyncError, Memory, MemoryType


def mock_response(data, status_code=200):
    """Create a mock httpx async response."""
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = data
    response.text = str(data)
    return response


@pytest.fixture
def client():
    return AsyncSeizn(
        api_key="szn_test_key",
        base_url="https://test.seizn.com",
        retries=1,
    )


class TestAsyncSeiznClient:
    """Test async client operations."""

    @pytest.mark.asyncio
    async def test_add_memory(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "memory": {
                    "id": "mem-1",
                    "content": "User likes TypeScript",
                    "memory_type": "preference",
                    "tags": ["lang"],
                    "namespace": "default",
                    "importance": 5,
                    "created_at": "2026-01-01T00:00:00Z",
                }
            }

            memory = await client.add("User likes TypeScript", memory_type=MemoryType.PREFERENCE)

            assert isinstance(memory, Memory)
            assert memory.content == "User likes TypeScript"
            mock_req.assert_called_once()

    @pytest.mark.asyncio
    async def test_add_many(self, client):
        with patch.object(client, 'add', new_callable=AsyncMock) as mock_add:
            mock_add.return_value = Memory(
                id="mem-1",
                content="test",
                memory_type="fact",
                tags=[],
                namespace="default",
                importance=5,
                created_at="2026-01-01T00:00:00Z",
            )

            results = await client.add_many([
                {"content": "a"},
                {"content": "b"},
                {"content": "c"},
            ])

            assert len(results) == 3
            assert mock_add.call_count == 3

    @pytest.mark.asyncio
    async def test_get_memory(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "memory": {
                    "id": "mem-1",
                    "content": "test",
                    "memory_type": "fact",
                    "tags": [],
                    "namespace": "default",
                    "importance": 5,
                    "created_at": "2026-01-01T00:00:00Z",
                }
            }

            memory = await client.get("mem-1")
            assert memory.id == "mem-1"

    @pytest.mark.asyncio
    async def test_search(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "results": [
                    {
                        "id": "mem-1",
                        "content": "found",
                        "similarity": 0.95,
                        "tags": [],
                        "namespace": "default",
                    }
                ]
            }

            results = await client.search("query")
            assert len(results) == 1
            assert results[0].similarity == 0.95

    @pytest.mark.asyncio
    async def test_update(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "memory": {
                    "id": "mem-1",
                    "content": "test",
                    "memory_type": "fact",
                    "tags": ["new"],
                    "namespace": "default",
                    "importance": 9,
                    "created_at": "2026-01-01T00:00:00Z",
                }
            }

            memory = await client.update("mem-1", tags=["new"], importance=9)
            assert memory.importance == 9

    @pytest.mark.asyncio
    async def test_delete(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {"deleted": True}
            result = await client.delete("mem-1")
            assert result is True

    @pytest.mark.asyncio
    async def test_extract(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "extracted": [
                    {"content": "likes dark mode", "memory_type": "preference", "confidence": 0.85}
                ]
            }

            results = await client.extract("I prefer dark mode")
            assert len(results) == 1

    @pytest.mark.asyncio
    async def test_context_manager(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "memory": {
                    "id": "mem-1",
                    "content": "test",
                    "memory_type": "fact",
                    "tags": [],
                    "namespace": "default",
                    "importance": 5,
                    "created_at": "2026-01-01T00:00:00Z",
                }
            }

            async with AsyncSeizn(api_key="szn_test") as c:
                # Override the _request on the new client too
                c._request = mock_req
                memory = await c.add("test")
                assert memory.id == "mem-1"

    @pytest.mark.asyncio
    async def test_error_4xx_no_retry(self, client):
        """4xx errors should NOT be retried."""
        call_count = 0

        async def fake_request(method, path, **kwargs):
            nonlocal call_count
            call_count += 1
            raise SeiznAsyncError("Not found", status_code=404)

        client._request = fake_request

        with pytest.raises(SeiznAsyncError) as exc_info:
            await client.get("nonexistent")

        assert exc_info.value.status_code == 404
        assert call_count == 1


class TestAsyncSpringMixin:
    """Test async Spring mixin methods."""

    @pytest.mark.asyncio
    async def test_get_edges(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
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
            }

            edges = await client.get_edges("a")
            assert len(edges) == 1

    @pytest.mark.asyncio
    async def test_get_temporal_status(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "active": 50,
                "expired": 2,
                "superseded": 5,
                "expiringSoon": 1,
            }

            status = await client.get_temporal_status()
            assert status.active == 50

    @pytest.mark.asyncio
    async def test_search_valid_at(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "results": [
                    {
                        "id": "mem-1",
                        "content": "valid fact",
                        "type": "fact",
                        "createdAt": "2026-01-01T00:00:00Z",
                    }
                ]
            }

            results = await client.search_valid_at("2026-01-15T00:00:00Z")
            assert len(results) == 1

    @pytest.mark.asyncio
    async def test_get_timeline(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "entries": [
                    {
                        "id": "mem-1",
                        "content": "event",
                        "type": "experience",
                        "eventTime": "2026-01-01T00:00:00Z",
                        "isCurrentlyValid": True,
                    }
                ]
            }

            entries = await client.get_timeline()
            assert len(entries) == 1

    @pytest.mark.asyncio
    async def test_list_ingestion_rules(self, client):
        with patch.object(client, '_request', new_callable=AsyncMock) as mock_req:
            mock_req.return_value = {
                "rules": [{"id": "r-1", "name": "test", "action": "store"}]
            }

            rules = await client.list_ingestion_rules()
            assert len(rules) == 1
