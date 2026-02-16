"""Test FoodBlock Python SDK agent functions."""

import pytest
from foodblock import (
    create, create_agent, create_draft, approve_draft, load_agent,
    generate_keypair, verify, head, query, Query
)


class TestCreateAgent:
    def test_creates_agent_with_keypair(self):
        operator = create('actor.producer', {'name': 'Test Farm'})
        agent = create_agent('Farm Bot', operator['hash'])

        assert agent['block']['type'] == 'actor.agent'
        assert agent['block']['state']['name'] == 'Farm Bot'
        assert agent['block']['refs']['operator'] == operator['hash']
        assert len(agent['keypair']['public_key']) == 64
        assert len(agent['keypair']['private_key']) == 64  # Ed25519 seed (32 bytes hex)
        assert agent['author_hash'] == agent['block']['hash']

    def test_agent_with_model_and_capabilities(self):
        operator = create('actor.foodie', {'name': 'User'})
        agent = create_agent('Assistant', operator['hash'], {
            'model': 'claude-sonnet',
            'capabilities': ['create', 'query']
        })

        assert agent['block']['state']['model'] == 'claude-sonnet'
        assert agent['block']['state']['capabilities'] == ['create', 'query']

    def test_requires_name(self):
        with pytest.raises(ValueError, match='name is required'):
            create_agent('', 'some_hash')

    def test_requires_operator(self):
        with pytest.raises(ValueError, match='operator_hash is required'):
            create_agent('Bot', '')

    def test_agent_can_sign(self):
        operator = create('actor.producer', {'name': 'Farm'})
        agent = create_agent('Bot', operator['hash'])

        block = create('substance.product', {'name': 'Bread'})
        signed = agent['sign'](block)

        assert signed['author_hash'] == agent['author_hash']
        assert signed['signature']
        assert verify(signed, agent['keypair']['public_key'])


class TestDraftApprove:
    def test_create_draft(self):
        operator = create('actor.producer', {'name': 'Farm'})
        agent = create_agent('Bot', operator['hash'])

        result = create_draft(agent, 'substance.product', {'name': 'Bread', 'price': 4.5})

        assert result['block']['state']['draft'] is True
        assert result['block']['state']['name'] == 'Bread'
        assert result['block']['refs']['agent'] == agent['author_hash']
        assert result['signed']['author_hash'] == agent['author_hash']

    def test_approve_draft(self):
        operator = create('actor.producer', {'name': 'Farm'})
        agent = create_agent('Bot', operator['hash'])

        draft_result = create_draft(agent, 'substance.product', {'name': 'Bread'})
        draft = draft_result['block']

        approved = approve_draft(draft)

        assert 'draft' not in approved['state']
        assert approved['state']['name'] == 'Bread'
        assert approved['refs']['updates'] == draft['hash']
        assert approved['refs']['approved_agent'] == agent['author_hash']
        assert 'agent' not in approved['refs']


class TestLoadAgent:
    def test_load_agent(self):
        operator = create('actor.producer', {'name': 'Farm'})
        agent = create_agent('Bot', operator['hash'])

        # Save and reload
        loaded = load_agent(agent['author_hash'], agent['keypair'])

        assert loaded['author_hash'] == agent['author_hash']
        assert loaded['keypair'] == agent['keypair']

        # Loaded agent can sign
        block = create('observe.snap', {'text': 'Hello'})
        signed = loaded['sign'](block)
        assert verify(signed, loaded['keypair']['public_key'])

    def test_requires_keypair(self):
        with pytest.raises(ValueError):
            load_agent('some_hash', None)

    def test_requires_private_key(self):
        with pytest.raises(ValueError):
            load_agent('some_hash', {'public_key': 'abc'})


class TestQueryBuilder:
    def test_builds_query(self):
        import asyncio

        async def mock_resolve(q):
            return q

        q = query(mock_resolve)
        q.type('substance.product').by_ref('seller', 'abc123').where_eq('name', 'Bread').latest().limit(10)

        result = asyncio.run(q.exec())

        assert result['type'] == 'substance.product'
        assert result['refs'] == {'seller': 'abc123'}
        assert result['state_filters'] == [{'field': 'name', 'op': 'eq', 'value': 'Bread'}]
        assert result['heads_only'] is True
        assert result['limit'] == 10

    def test_method_chaining(self):
        q = query(lambda x: x)
        result = q.type('actor').where_gt('age', 18).where_lt('age', 65).offset(20)
        assert isinstance(result, Query)


class TestHead:
    def test_head_finds_latest(self):
        import asyncio

        # Create a chain: v1 -> v2 -> v3
        v1 = create('test', {'v': 1})
        v2 = create('test', {'v': 2}, {'updates': v1['hash']})
        v3 = create('test', {'v': 3}, {'updates': v2['hash']})

        blocks = {v1['hash']: v1, v2['hash']: v2, v3['hash']: v3}

        # Build forward index
        forward = {}
        for b in blocks.values():
            updates = b.get('refs', {}).get('updates')
            if updates:
                forward.setdefault(updates, []).append(b)

        async def resolve_forward(h):
            return forward.get(h, [])

        result = asyncio.run(head(v1['hash'], resolve_forward))
        assert result == v3['hash']

    def test_head_of_genesis(self):
        import asyncio

        v1 = create('test', {'v': 1})

        async def resolve_forward(h):
            return []

        result = asyncio.run(head(v1['hash'], resolve_forward))
        assert result == v1['hash']
