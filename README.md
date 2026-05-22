# EdgeSpark Templates

A collection of one-command, AI-agent-native templates for [EdgeSpark](https://edgespark.dev).
Each lives in its own subdirectory and is initialized directly from GitHub:

```bash
edgespark init my-app --agent claude --template github:Yrzhe/edgespark-template/<template>
```

## Templates

| Template | What it is | Init |
|----------|------------|------|
| [**hatch**](./hatch) 🐣⚡ | AI-agent-native static-site host with a built-in backend (hosting + BaaS + agent docs) and a refined dashboard. | `edgespark init my-hatch --agent claude --template github:Yrzhe/edgespark-template/hatch` |

See each template's own `README.md` for full details and setup.

## License

MIT
