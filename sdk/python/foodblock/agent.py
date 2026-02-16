"""
FoodBlock Agent Identity System

Allows AI agents to have their own FoodBlock identity, sign blocks,
create drafts for human approval, and operate on behalf of a human operator.
"""

from .block import create
from .verify import generate_keypair, sign


def create_agent(name, operator_hash, opts=None):
    """
    Create a new AI agent with its own identity and Ed25519 keypair.

    Every agent must have an operator — the human or business it acts for.

    Args:
        name: Name for the agent (e.g. 'Bakery Assistant')
        operator_hash: Hash of the actor block this agent works for
        opts: Optional dict with 'model', 'capabilities', 'state' keys

    Returns:
        dict with 'block', 'keypair', 'author_hash', 'sign' (callable)
    """
    if not name or not isinstance(name, str):
        raise ValueError('FoodBlock Agent: name is required')
    if not operator_hash or not isinstance(operator_hash, str):
        raise ValueError('FoodBlock Agent: operator_hash is required — every agent must have an operator')

    opts = opts or {}
    keypair = generate_keypair()

    state = {'name': name}
    if opts.get('model'):
        state['model'] = opts['model']
    if opts.get('capabilities'):
        state['capabilities'] = opts['capabilities']
    if opts.get('state'):
        state.update(opts['state'])

    block = create('actor.agent', state, {'operator': operator_hash})

    def agent_sign(foodblock):
        return sign(foodblock, block['hash'], keypair['private_key'])

    return {
        'block': block,
        'keypair': keypair,
        'author_hash': block['hash'],
        'sign': agent_sign,
    }


def create_draft(agent, type_, state=None, refs=None):
    """
    Create a draft block on behalf of an agent.

    Draft blocks have state.draft = True and must be approved by the human
    operator before they become confirmed blocks.

    Args:
        agent: Agent dict returned by create_agent() or load_agent()
        type_: Block type (e.g. 'transfer.order')
        state: Block state dict
        refs: Block refs dict

    Returns:
        dict with 'block' and 'signed' wrapper
    """
    state = dict(state or {})
    refs = dict(refs or {})

    state['draft'] = True
    refs['agent'] = agent['author_hash']

    block = create(type_, state, refs)
    signed = agent['sign'](block)

    return {'block': block, 'signed': signed}


def approve_draft(draft_block):
    """
    Approve a draft block created by an agent.

    Removes the 'draft' flag from state, moves the 'agent' ref to
    'approved_agent', and creates an update link to the draft.

    Args:
        draft_block: The draft block dict to approve

    Returns:
        A new confirmed block (the operator should sign this)
    """
    # Remove draft from state
    approved_state = {k: v for k, v in draft_block['state'].items() if k != 'draft'}

    # Move agent ref to approved_agent, add updates ref
    refs = dict(draft_block.get('refs', {}))
    agent_hash = refs.pop('agent', None)
    approved_refs = {
        **refs,
        'updates': draft_block['hash'],
    }
    if agent_hash:
        approved_refs['approved_agent'] = agent_hash

    return create(draft_block['type'], approved_state, approved_refs)


def load_agent(author_hash, keypair):
    """
    Load an existing agent from saved credentials.

    Use this to restore an agent after the keypair has been persisted.

    Args:
        author_hash: The agent's block hash
        keypair: dict with 'public_key' and 'private_key' hex strings

    Returns:
        dict with 'author_hash', 'keypair', 'sign' (callable)
    """
    if not author_hash or not keypair or not keypair.get('private_key'):
        raise ValueError('FoodBlock Agent: author_hash and keypair with private_key are required')

    def agent_sign(foodblock):
        return sign(foodblock, author_hash, keypair['private_key'])

    return {
        'author_hash': author_hash,
        'keypair': keypair,
        'sign': agent_sign,
    }
