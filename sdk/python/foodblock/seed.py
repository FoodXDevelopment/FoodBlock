"""FoodBlock Seed Data — vocabularies and templates as actual blocks."""

from .block import create
from .vocabulary import VOCABULARIES
from .template import TEMPLATES


def seed_vocabularies():
    """Generate all vocabulary blocks from built-in definitions."""
    result = []
    for domain, defn in VOCABULARIES.items():
        state = {
            'domain': defn['domain'],
            'for_types': defn['for_types'],
            'fields': defn['fields'],
        }
        if 'transitions' in defn:
            state['transitions'] = defn['transitions']
        result.append(create('observe.vocabulary', state))
    return result


def seed_templates():
    """Generate all template blocks from built-in definitions."""
    result = []
    for key, defn in TEMPLATES.items():
        result.append(create('observe.template', {
            'name': defn['name'],
            'description': defn['description'],
            'steps': defn['steps'],
        }))
    return result


def seed_all():
    """Generate all seed blocks (vocabularies + templates)."""
    return seed_vocabularies() + seed_templates()
