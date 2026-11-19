"""Focused dependency/lifecycle regressions. No test executes pip or connects to a graph."""
from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from soup.core.contracts import ConflictError, ValidationError
from soup.core.packages import dependencies as deps
from soup.core.packages.loader import purge
from soup.core.packages.manager import PackageManager, PackageManagerConfig
from soup.core.packages.manifest import load_manifest, parse_manifest
from soup.core.plugin_context import DefaultPluginContext
from soup.core.plugin_manager import PluginManager

LIBRARY = 'soup_dependency_test_xyz'
SPEC = f'{LIBRARY}==1.0'


def manifest(name='dependency_example', version='1.0', specs=()):
    return dict(name=name, version=version, api_version='4.0', python_dependencies=list(specs),
                databases=['memgraph', 'neo4j'], server=dict(module='server', plugin='plugin:Plugin'))


def package_files(version='1.0', requirements=SPEC):
    return {'soup-package.json': json.dumps(manifest(version=version)), 'requirements.txt': requirements,
            'server/__init__.py': '', 'server/plugin.py':
            'from soup.core.contracts import SoupPlugin\nclass Plugin(SoupPlugin):\n'
            '    def register(self, ctx):\n        pass\n'}


class DependenciesTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.original_path = sys.path.copy()
        self.original_pythonpath = os.environ.get('PYTHONPATH')
        self.calls = []
        self.fake = patch.object(deps, '_run_pip', side_effect=self.pip)
        self.fake.start()

    def tearDown(self):
        self.fake.stop()
        sys.path[:] = self.original_path
        if self.original_pythonpath is None:
            os.environ.pop('PYTHONPATH', None)
        else:
            os.environ['PYTHONPATH'] = self.original_pythonpath
        sys.modules.pop(LIBRARY, None)
        purge('dependency_example')
        self.temporary.cleanup()

    def pip(self, args):
        self.calls.append(args)
        if '--dry-run' in args:
            constraints = Path(args[args.index('--constraint') + 1]).read_text()
            self.assertIn('packaging==', constraints)
            self.constraints = constraints
            Path(args[args.index('--report') + 1]).write_text(json.dumps(
                {'install': [{'metadata': {'name': LIBRARY, 'version': '1.0'}}]}))
        else:
            target = Path(args[args.index('--target') + 1])
            info = target / f'{LIBRARY}-1.0.dist-info'
            info.mkdir(parents=True)
            (info / 'METADATA').write_text(f'Metadata-Version: 2.1\nName: {LIBRARY}\nVersion: 1.0\n')
            (target / f'{LIBRARY}.py').write_text('VALUE = 42\n')

    def manager(self):
        config = PackageManagerConfig(packages_path=(str(self.base / 'bundled'), str(self.base / 'installed')),
                                      installed_dir=str(self.base / 'installed'), allow_install=True)
        return PackageManager(PluginManager(), DefaultPluginContext(), config)

    def archive(self, **kwargs):
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            for name, content in package_files(**kwargs).items():
                archive.writestr(f'dependency_example/{name}', content)
        output.seek(0)
        return output

    def test_missing_needs_approval(self):
        with self.assertRaises(ConflictError) as error:
            deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [])
        self.assertTrue(error.exception.details['dependency_approval_required'])
        self.assertEqual([], self.calls)

    def test_compatible_and_incompatible_installed(self):
        item = parse_manifest(manifest(specs=['packaging>=20']))
        deps.ensure_dependencies(item, self.base, [], lookup=lambda _: '23.1')
        item = parse_manifest(manifest(specs=['packaging>=99']))
        with self.assertRaises(ConflictError):
            deps.ensure_dependencies(item, self.base, [], approved=True, lookup=lambda _: '23.1')
        self.assertEqual([], self.calls)

    def test_approval_install_import_and_restart(self):
        deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [], approved=True)
        self.assertEqual(2, len(self.calls))
        self.assertEqual(42, __import__(LIBRARY).VALUE)
        sys.path[:] = self.original_path
        sys.modules.pop(LIBRARY)
        deps.activate_dependencies(self.base)
        self.assertEqual(42, __import__(LIBRARY).VALUE)
        self.assertEqual('1.0', deps.installed_version(LIBRARY))
        process = subprocess.run([sys.executable, '-c', f'import {LIBRARY}; print({LIBRARY}.VALUE)'],
                                 capture_output=True, text=True, check=True)
        self.assertEqual('42', process.stdout.strip())

    def test_pip_failure_leaves_no_committed_environment(self):
        with patch.object(deps, '_run_pip', side_effect=ValidationError('pip failed')):
            with self.assertRaisesRegex(ValidationError, 'pip failed'):
                deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [], approved=True)
        self.assertEqual([], list(self.base.rglob('env-*')))
        self.assertNotIn(str(self.base), sys.path)

    def test_failed_second_pip_does_not_publish_partial_files(self):
        def fail_install(args):
            if '--dry-run' in args:
                return self.pip(args)
            self.pip(args)
            raise ValidationError('install interrupted')
        with patch.object(deps, '_run_pip', side_effect=fail_install):
            with self.assertRaises(ValidationError):
                deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [], approved=True)
        self.assertEqual([], list(self.base.rglob('env-*')))
        self.assertIsNone(deps.installed_version(LIBRARY))

    def test_resolver_preserves_active_package_constraints(self):
        active = parse_manifest(manifest(name='other', specs=['packaging<24']))
        deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [active], approved=True)
        self.assertIn('packaging<24', self.constraints)
        self.assertNotIn('packaging<24', self.calls[0])

    def test_peer_constraints_never_install_unapproved_libraries(self):
        unapproved = 'soup_unapproved_peer_xyz==2.0'
        peer = parse_manifest(manifest(name='other', specs=[unapproved]))
        deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [peer], approved=True)
        self.assertIn(unapproved, self.constraints)
        self.assertNotIn(unapproved, self.calls[0])
        self.assertNotIn(unapproved, self.calls[1])

    def test_resolver_rejects_installed_changes(self):
        def unsafe(args):
            Path(args[args.index('--report') + 1]).write_text(json.dumps(
                {'install': [{'metadata': {'name': 'packaging', 'version': '99.0'}}]}))
        with patch.object(deps, '_run_pip', side_effect=unsafe):
            with self.assertRaisesRegex(ConflictError, 'change installed'):
                deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [], approved=True)

    def test_merge_and_duplicate_declarations(self):
        root = self.base / 'package'
        (root / 'server').mkdir(parents=True)
        (root / 'server/__init__.py').touch()
        (root / 'soup-package.json').write_text(json.dumps(manifest(specs=[SPEC])))
        (root / 'requirements.txt').write_text(f'# comment\n{SPEC}\n')
        self.assertEqual((SPEC,), load_manifest(root).python_dependencies)
        (root / 'requirements.txt').write_text(f'{LIBRARY}==2.0')
        with self.assertRaisesRegex(ValidationError, 'single declaration'):
            load_manifest(root)

    def test_reject_pip_options_and_urls(self):
        path = self.base / 'requirements.txt'
        for content in ['-r other.txt', '--index-url https://example.org', 'library @ https://example.org/lib.whl']:
            path.write_text(content)
            with self.assertRaises(ValidationError):
                deps.read_requirements(path)

    def test_zip_install_approval_uninstall_keeps_shared_dependency(self):
        manager = self.manager()
        with self.assertRaises(ConflictError):
            manager.install(self.archive())
        self.assertIsNone(manager.source('dependency_example'))
        info = manager.install(self.archive(), approve_dependencies=True)
        self.assertEqual('active', info.status)
        manager.uninstall('dependency_example')
        self.assertEqual('1.0', deps.installed_version(LIBRARY))

    def test_upgrade_failure_preserves_previous_active_package(self):
        manager = self.manager()
        manager.install(self.archive(requirements=''))
        with patch.object(deps, '_run_pip', side_effect=ValidationError('pip failed')):
            with self.assertRaises(ValidationError):
                manager.install(self.archive(version='2.0'), approve_dependencies=True)
        self.assertEqual('1.0', manager.info('dependency_example').version)
        self.assertEqual('active', manager.info('dependency_example').status)

    def test_bundled_startup_and_restart(self):
        root = self.base / 'bundled/dependency_example'
        for name, content in package_files().items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        manager = self.manager()
        with patch.dict(os.environ, {'SOUP_APPROVE_PYTHON_DEPENDENCIES': ''}):
            self.assertTrue(manager.load_all().failed)
        with patch.dict(os.environ, {'SOUP_APPROVE_PYTHON_DEPENDENCIES': 'dependency_example'}):
            self.assertIn('dependency_example', manager.load_all().loaded)
        purge('dependency_example')
        sys.path[:] = self.original_path
        self.calls.clear()
        with patch.dict(os.environ, {'SOUP_APPROVE_PYTHON_DEPENDENCIES': ''}):
            self.assertIn('dependency_example', self.manager().load_all().loaded)
        self.assertEqual([], self.calls)

    def test_docker_build_installs_all_bundled_dependencies(self):
        root = self.base / 'bundled/dependency_example'
        for name, content in package_files().items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        other = root.parent / 'another_package'
        other.mkdir()
        for name, content in package_files().items():
            path = other / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if name == 'soup-package.json':
                content = json.dumps(manifest(name='another_package'))
            path.write_text(content)
        with patch.object(deps, 'ensure_dependencies') as ensure:
            deps.install_bundled(root.parent, self.base / 'python')
            self.assertEqual(2, ensure.call_count)
            self.assertEqual({'another_package', 'dependency_example'},
                             {call.args[0].name for call in ensure.call_args_list})
            self.assertTrue(all(call.kwargs['approved'] for call in ensure.call_args_list))
            self.assertTrue(all(call.kwargs['allow_source'] for call in ensure.call_args_list))
        deps.install_bundled(root.parent, self.base / 'python')
        self.assertEqual(2, len(self.calls))
        for args in self.calls:
            self.assertIn('--prefer-binary', args)
            self.assertNotIn('--only-binary=:all:', args)

    def test_runtime_install_remains_wheel_only(self):
        deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [], approved=True)
        for args in self.calls:
            self.assertIn('--only-binary=:all:', args)
            self.assertNotIn('--prefer-binary', args)

    def test_missing_extra_requires_approval(self):
        item = parse_manifest(manifest(specs=['packaging[soup_extra]']))
        with patch.object(deps.importlib_metadata, 'requires', return_value=[f'{SPEC}; extra == "soup_extra"']):
            with self.assertRaises(ConflictError) as error:
                deps.ensure_dependencies(item, self.base, [])
        self.assertIn(LIBRARY, str(error.exception))
        self.assertEqual([], self.calls)

    def test_failed_plugin_upgrade_rolls_back_after_dependency_success(self):
        manager = self.manager()
        manager.install(self.archive(requirements=''))
        output = io.BytesIO()
        files = package_files(version='2.0')
        files['server/plugin.py'] = files['server/plugin.py'].replace('pass', 'raise RuntimeError("register failed")')
        with zipfile.ZipFile(output, 'w') as archive:
            for name, content in files.items():
                archive.writestr(f'dependency_example/{name}', content)
        output.seek(0)
        with self.assertRaisesRegex(ValidationError, 'register failed'):
            manager.install(output, approve_dependencies=True)
        self.assertEqual('active', manager.info('dependency_example').status)
        self.assertEqual('1.0', manager.info('dependency_example').version)
        self.assertEqual('1.0', deps.installed_version(LIBRARY))

    def test_incomplete_wheel_is_never_published(self):
        def incomplete(args):
            if '--dry-run' in args:
                self.pip(args)
            else:
                Path(args[args.index('--target') + 1]).mkdir()
        with patch.object(deps, '_run_pip', side_effect=incomplete):
            with self.assertRaisesRegex(ValidationError, 'nothing was activated'):
                deps.ensure_dependencies(parse_manifest(manifest(specs=[SPEC])), self.base, [], approved=True)
        self.assertEqual([], list(self.base.rglob('env-*')))

    def test_api_requires_separate_explicit_approval(self):
        from types import SimpleNamespace
        from flask import Flask
        from soup.api.package_routes import build_package_blueprint

        manager = self.manager()
        app = Flask(__name__)
        app.testing = True
        app.register_blueprint(build_package_blueprint(SimpleNamespace(package_manager=manager, frontend=None)))
        client = app.test_client()
        with self.assertRaises(ConflictError):
            client.post('/api/v3/packages', data={'file': (self.archive(), 'package.zip')})
        response = client.post('/api/v3/packages', data={
            'file': (self.archive(), 'package.zip'), 'approve_dependencies': 'true'})
        self.assertEqual(201, response.status_code)

    def test_pip_subprocess_failure_and_timeout(self):
        # Exercise the real wrapper, replacing subprocess.run: never execute pip.
        self.fake.stop()
        try:
            with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'version conflict')):
                with self.assertRaisesRegex(ValidationError, 'resolution/installation failed'):
                    deps._run_pip(['install', 'example'])
            with patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('pip', 600)):
                with self.assertRaisesRegex(ValidationError, 'timed out'):
                    deps._run_pip(['install', 'example'])
        finally:
            self.fake.start()


if __name__ == '__main__':
    unittest.main()
