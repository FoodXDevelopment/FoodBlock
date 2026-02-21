"""Tests for trust computation and seed data modules."""

import pytest
from datetime import datetime, timezone, timedelta
from foodblock import (
    create, compute_trust, connection_density, create_trust_policy,
    DEFAULT_WEIGHTS, seed_vocabularies, seed_templates, seed_all,
    VOCABULARIES, TEMPLATES,
)


def actor(name):
    return create('actor.producer', {'name': name})


def certification(subject_hash, authority_hash, valid_until):
    block = create('observe.certification', {
        'instance_id': f'cert-{subject_hash[:8]}',
        'name': 'Organic',
        'valid_until': valid_until,
    }, {'subject': subject_hash, 'authority': authority_hash})
    block['author_hash'] = authority_hash
    return block


def review(subject_hash, author_hash, rating):
    block = create('observe.review', {
        'instance_id': f'rev-{author_hash[:8]}',
        'rating': rating,
    }, {'subject': subject_hash, 'author': author_hash})
    block['author_hash'] = author_hash
    return block


def order(buyer_hash, seller_hash, has_payment):
    state = {
        'instance_id': f'ord-{buyer_hash[:8]}-{seller_hash[:8]}',
        'quantity': 10,
    }
    if has_payment:
        state['adapter_ref'] = 'stripe_pi_123'
    return create('transfer.order', state, {'buyer': buyer_hash, 'seller': seller_hash})


# --- Trust computation tests ---

class TestComputeTrust:
    def test_zero_score_for_unknown(self):
        result = compute_trust('nonexistent', [])
        assert result['score'] == 0
        assert result['meets_minimum'] is True

    def test_authority_certs(self):
        farm = actor('Green Acres')
        authority = actor('Soil Association')
        cert = certification(farm['hash'], authority['hash'], '2027-01-01')
        result = compute_trust(farm['hash'], [farm, authority, cert])
        assert result['inputs']['authority_certs'] == 1
        assert result['score'] >= DEFAULT_WEIGHTS['authority_certs']

    def test_expired_certs_excluded(self):
        farm = actor('Green Acres')
        authority = actor('Soil Association')
        cert = certification(farm['hash'], authority['hash'], '2020-01-01')
        result = compute_trust(farm['hash'], [farm, authority, cert])
        assert result['inputs']['authority_certs'] == 0

    def test_peer_reviews(self):
        shop = actor('Bakery')
        r1 = actor('Customer A')
        r2 = actor('Customer B')
        rev1 = review(shop['hash'], r1['hash'], 5)
        rev2 = review(shop['hash'], r2['hash'], 4)
        result = compute_trust(shop['hash'], [shop, r1, r2, rev1, rev2])
        assert result['inputs']['peer_reviews']['count'] == 2
        assert result['inputs']['peer_reviews']['avg_score'] > 0

    def test_verified_orders(self):
        buyer = actor('Restaurant')
        seller = actor('Supplier')
        ord = order(buyer['hash'], seller['hash'], True)
        result = compute_trust(seller['hash'], [buyer, seller, ord])
        assert result['inputs']['verified_orders'] == 1

    def test_unverified_orders_ignored(self):
        buyer = actor('Restaurant')
        seller = actor('Supplier')
        ord = order(buyer['hash'], seller['hash'], False)
        result = compute_trust(seller['hash'], [buyer, seller, ord])
        assert result['inputs']['verified_orders'] == 0

    def test_chain_depth(self):
        farm = actor('Farm')
        mill = actor('Mill')
        bakery = actor('Bakery')
        b1 = create('transfer.order', {'instance_id': 'o1', 'quantity': 50}, {'seller': farm['hash']})
        b1['author_hash'] = mill['hash']
        b2 = create('transfer.order', {'instance_id': 'o2', 'quantity': 30}, {'seller': farm['hash']})
        b2['author_hash'] = bakery['hash']
        result = compute_trust(farm['hash'], [farm, mill, bakery, b1, b2])
        assert result['inputs']['chain_depth'] == 2

    def test_account_age_capped(self):
        farm = actor('Old Farm')
        farm['created_at'] = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
        result = compute_trust(farm['hash'], [farm])
        assert result['inputs']['account_age'] <= 365
        assert result['inputs']['account_age'] >= 364

    def test_custom_weights(self):
        farm = actor('Green Acres')
        authority = actor('FSA')
        cert = certification(farm['hash'], authority['hash'], '2027-01-01')
        blocks = [farm, authority, cert]
        default = compute_trust(farm['hash'], blocks)
        custom = compute_trust(farm['hash'], blocks, {'weights': {'authority_certs': 10.0}})
        assert custom['score'] > default['score']

    def test_min_score(self):
        farm = actor('New Farm')
        result = compute_trust(farm['hash'], [farm], {'min_score': 100})
        assert result['meets_minimum'] is False

    def test_throws_missing_hash(self):
        with pytest.raises(ValueError, match='actor_hash'):
            compute_trust('', [])
        with pytest.raises(ValueError, match='actor_hash'):
            compute_trust(None, [])

    def test_throws_non_list(self):
        with pytest.raises(ValueError, match='blocks must be a list'):
            compute_trust('hash', 'not a list')


class TestConnectionDensity:
    def test_no_shared_refs(self):
        a = actor('A')
        b = actor('B')
        c = actor('C')
        d = actor('D')
        b1 = create('transfer.order', {'instance_id': 'x1', 'q': 1}, {'buyer': a['hash'], 'seller': c['hash']})
        b2 = create('transfer.order', {'instance_id': 'x2', 'q': 1}, {'buyer': b['hash'], 'seller': d['hash']})
        assert connection_density(a['hash'], b['hash'], [b1, b2]) == 0

    def test_shared_refs(self):
        a = actor('A')
        b = actor('B')
        shared = actor('Shared Supplier')
        b1 = create('transfer.order', {'instance_id': 'x1', 'q': 1}, {'buyer': a['hash'], 'seller': shared['hash']})
        b2 = create('transfer.order', {'instance_id': 'x2', 'q': 1}, {'buyer': b['hash'], 'seller': shared['hash']})
        assert connection_density(a['hash'], b['hash'], [b1, b2]) > 0

    def test_null_actors(self):
        assert connection_density(None, 'b', []) == 0
        assert connection_density('a', None, []) == 0


class TestCreateTrustPolicy:
    def test_creates_policy(self):
        policy = create_trust_policy('UK Organic', {'authority_certs': 5.0},
                                     required_authorities=['fsa_hash'], min_score=10)
        assert policy['type'] == 'observe.trust_policy'
        assert policy['state']['name'] == 'UK Organic'
        assert policy['state']['weights'] == {'authority_certs': 5.0}
        assert policy['state']['required_authorities'] == ['fsa_hash']
        assert policy['state']['min_score'] == 10

    def test_minimal_policy(self):
        policy = create_trust_policy('Basic', {'peer_reviews': 2.0})
        assert policy['type'] == 'observe.trust_policy'
        assert 'required_authorities' not in policy['state']


# --- Seed data tests ---

class TestSeedVocabularies:
    def test_count(self):
        vocabs = seed_vocabularies()
        assert len(vocabs) == len(VOCABULARIES)

    def test_type(self):
        for v in seed_vocabularies():
            assert v['type'] == 'observe.vocabulary'

    def test_has_fields(self):
        for v in seed_vocabularies():
            assert v['state']['domain']
            assert v['state']['for_types']
            assert v['state']['fields']

    def test_deterministic(self):
        a = seed_vocabularies()
        b = seed_vocabularies()
        for i in range(len(a)):
            assert a[i]['hash'] == b[i]['hash']


class TestSeedTemplates:
    def test_count(self):
        templates = seed_templates()
        assert len(templates) == len(TEMPLATES)

    def test_type(self):
        for t in seed_templates():
            assert t['type'] == 'observe.template'

    def test_has_steps(self):
        for t in seed_templates():
            assert t['state']['name']
            assert t['state']['steps']

    def test_deterministic(self):
        a = seed_templates()
        b = seed_templates()
        for i in range(len(a)):
            assert a[i]['hash'] == b[i]['hash']


class TestSeedAll:
    def test_total_count(self):
        assert len(seed_all()) == len(VOCABULARIES) + len(TEMPLATES)

    def test_unique_hashes(self):
        all_blocks = seed_all()
        hashes = {b['hash'] for b in all_blocks}
        assert len(hashes) == len(all_blocks)


# --- Instance_id auto-injection tests ---

class TestInstanceIdAutoInject:
    def test_event_types_get_instance_id(self):
        t = create('transfer.order', {'quantity': 5})
        assert 'instance_id' in t['state']
        tr = create('transform.process', {'name': 'Baking'})
        assert 'instance_id' in tr['state']
        o = create('observe.review', {'rating': 5})
        assert 'instance_id' in o['state']

    def test_preserves_explicit_instance_id(self):
        block = create('transfer.order', {'instance_id': 'my-id', 'quantity': 5})
        assert block['state']['instance_id'] == 'my-id'

    def test_entity_types_no_injection(self):
        a = create('actor.producer', {'name': 'Farm'})
        assert 'instance_id' not in a['state']
        p = create('place.market', {'name': 'Market'})
        assert 'instance_id' not in p['state']
        s = create('substance.product', {'name': 'Bread'})
        assert 'instance_id' not in s['state']

    def test_definitional_types_no_injection(self):
        v = create('observe.vocabulary', {'domain': 'test', 'for_types': ['test'], 'fields': {}})
        assert 'instance_id' not in v['state']
        t = create('observe.template', {'name': 'test', 'steps': []})
        assert 'instance_id' not in t['state']
