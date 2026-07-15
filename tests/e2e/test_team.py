"""E2E tests for the team resolver and theming feature (js/team.js)."""
from pathlib import Path
import pytest
from playwright.sync_api import Page

REPO_ROOT = Path(__file__).parent.parent.parent
APP_URL = f"file://{REPO_ROOT / 'app.html'}"

DEFAULT_ACCENT = '#e80a89'   # --accent from css/base.css (raw CSS custom property value)
TIGERS_ACCENT  = '#f5a623'  # --accent from css/themes/tigers.css


def get_accent(page: Page) -> str:
    return page.evaluate(
        "getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()"
    )


def test_default_theme_no_team(page: Page):
    """Without a team param or stored preference, the default accent color is used."""
    page.goto(APP_URL)
    page.wait_for_load_state('domcontentloaded')
    accent = get_accent(page)
    assert accent == DEFAULT_ACCENT  # nosemgrep: python.lang.security.audit.assert-used


def test_team_param_applies_theme(page: Page):
    """?team=tigers applies the Tigers theme and strips the param from the URL."""
    page.goto(APP_URL + '?team=tigers')
    page.wait_for_load_state('domcontentloaded')

    accent = get_accent(page)
    assert accent == TIGERS_ACCENT  # nosemgrep: python.lang.security.audit.assert-used

    # Param must be stripped from URL after resolveTeam runs
    assert 'team=' not in page.url  # nosemgrep: python.lang.security.audit.assert-used


def test_team_param_persisted_to_localstorage(page: Page):
    """?team=tigers writes 'tigers' to localStorage['spikefit_team']."""
    page.goto(APP_URL + '?team=tigers')
    page.wait_for_load_state('domcontentloaded')
    stored = page.evaluate("localStorage.getItem('spikefit_team')")
    assert stored == 'tigers'  # nosemgrep: python.lang.security.audit.assert-used


def test_stored_team_applies_theme_on_next_load(page: Page):
    """A stored spikefit_team value applies the theme on subsequent page loads."""
    page.add_init_script("localStorage.setItem('spikefit_team', 'tigers');")
    page.goto(APP_URL)
    page.wait_for_load_state('domcontentloaded')

    accent = get_accent(page)
    assert accent == TIGERS_ACCENT  # nosemgrep: python.lang.security.audit.assert-used


def test_unknown_team_param_ignored(page: Page):
    """An unknown ?team= value does not apply any theme; default colors are used."""
    page.goto(APP_URL + '?team=hackers')
    page.wait_for_load_state('domcontentloaded')

    accent = get_accent(page)
    assert accent == DEFAULT_ACCENT  # nosemgrep: python.lang.security.audit.assert-used

    stored = page.evaluate("localStorage.getItem('spikefit_team')")
    assert stored is None  # nosemgrep: python.lang.security.audit.assert-used


def test_theme_link_injected_for_known_team(page: Page):
    """js/team.js appends a stylesheet <link> with the exact theme path when tigers team is active."""
    page.goto(APP_URL + '?team=tigers')
    page.wait_for_load_state('domcontentloaded')
    # Exact rel="stylesheet" and exact href — substring match would accept preload/prefetch
    link_count = page.locator('link[rel="stylesheet"][href="css/themes/tigers.css"]').count()
    assert link_count == 1  # nosemgrep: python.lang.security.audit.assert-used


def test_no_theme_link_for_default(page: Page):
    """No extra theme <link> is injected when no team is resolved."""
    page.goto(APP_URL)
    page.wait_for_load_state('domcontentloaded')
    link_count = page.locator('link[href*="themes/"]').count()
    assert link_count == 0  # nosemgrep: python.lang.security.audit.assert-used


def test_other_query_params_survive_team_stripping(page: Page):
    """Non-team query params are preserved after ?team= is stripped from the URL."""
    page.goto(APP_URL + '?ref=coach&team=tigers')
    page.wait_for_load_state('domcontentloaded')
    assert 'team=' not in page.url  # nosemgrep: python.lang.security.audit.assert-used
    assert 'ref=coach' in page.url  # nosemgrep: python.lang.security.audit.assert-used


def test_unknown_team_param_stays_in_url(page: Page):
    """An unknown ?team= value is NOT stripped from the URL (only valid teams are processed)."""
    page.goto(APP_URL + '?team=hackers')
    page.wait_for_load_state('domcontentloaded')
    assert 'team=hackers' in page.url  # nosemgrep: python.lang.security.audit.assert-used
