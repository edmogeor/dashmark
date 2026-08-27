# Metrics

Dashmark's metric library and configuration guides are documented at:

- [Metrics overview](https://edmogeor.github.io/dashmark/docs/metrics/)
- [Library metrics](https://edmogeor.github.io/dashmark/docs/metrics/library/)
- [Custom metrics](https://edmogeor.github.io/dashmark/docs/metrics/custom/)
- [Contribute a library metric](https://edmogeor.github.io/dashmark/docs/metrics/contributing/)

Library definitions live in `metrics/<provider>/<metric-name>.yml`. Provider-wide source settings and chart groups belong in `metrics/<provider>/provider.yml`.

The pre-commit hook updates [`LIBRARY.md`](LIBRARY.md) when staged metric definitions change. Pull requests automatically run metric validation, linting, type checks, tests, and builds.

To check a metric locally before submitting, run:

```bash
npm run generate:metrics-library
npm run validate:metrics
npm test
npm run typecheck
npm run lint
```
