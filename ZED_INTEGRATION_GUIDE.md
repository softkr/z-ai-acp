# Zed Editor에서 Z.AI ACP 에이전트 설정하기

## 개요

Zed Editor는 Agent Client Protocol (ACP)를 통해 외부 AI 에이전트를 지원합니다. 이 가이드에서는 `z-ai-acp`를 Zed에 통합하는 방법을 설명합니다.

## 사전 요구사항

- Zed Editor 설치
- Node.js 18+ 설치
- `z-ai-acp` 설치:
  ```bash
  npm install -g z-ai-acp
  ```

## 1. 기본 설정

Zed 설정 파일 (`~/.config/zed/settings.json`)에 에이전트를 추가합니다:

```json
{
  "agent_servers": {
    "Z.AI Agent": {
      "type": "custom",
      "command": "z-ai-acp",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

## 2. Z.AI 설정 관리

### 2.1 Z.AI API 키 설정

Z.AI API 키를 설정하려면 managed-settings.json을 생성하세요:

```bash
# 설정 디렉토리 생성
mkdir -p ~/.config/z-ai-acp

# managed-settings.json 생성
cat > ~/.config/z-ai-acp/managed-settings.json << EOF
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your_z_ai_api_key_here",
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "Z_AI_MODEL_MAPPING": "true"
  },
  "zAi": {
    "enableGlmMapping": true,
    "defaultModel": "glm-4.7",
    "timeoutMs": 3000000
  }
}
EOF
```

### 2.2 환경변수를 통한 설정 (대안)

```json
{
  "agent_servers": {
    "Z.AI Agent": {
      "type": "custom",
      "command": "z-ai-acp",
      "args": ["--acp"],
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your_z_ai_api_key_here",
        "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
        "Z_AI_MODEL_MAPPING": "true"
      }
    }
  }
}
```

## 3. 고급 설정

### 3.1 여러 에이전트 설정

```json
{
  "agent_servers": {
    "Z.AI GLM-4.6": {
      "type": "custom",
      "command": "z-ai-acp",
      "args": ["--acp"],
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your_z_ai_api_key",
        "Z_AI_DEFAULT_MODEL": "glm-4.6"
      }
    },
    "Z.AI GLM-4.5-Air": {
      "type": "custom",
      "command": "z-ai-acp",
      "args": ["--acp"],
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your_z_ai_api_key",
        "Z_AI_DEFAULT_MODEL": "glm-4.5-air"
      }
    }
  }
}
```

### 3.2 개발 모드 설정

```json
{
  "agent_servers": {
    "Z.AI Dev": {
      "type": "custom",
      "command": "node",
      "args": ["/path/to/z-ai-acp/dist/index.js", "--acp"],
      "env": {
        "CLAUDE_CODE_SETTINGS_PATH": "/path/to/your/managed-settings.json",
        "Z_AI_MODEL_MAPPING": "true"
      }
    }
  }
}
```

## 4. 키바인딩 설정

### 4.1 새 에이전트 스레드 생성

```json
{
  "bindings": {
    "cmd-alt-z": ["agent::NewExternalAgentThread", {
      "agent": {
        "custom": {
          "name": "Z.AI Agent",
          "command": {"command": "z-ai-acp", "args": ["--acp"]}
        }
      }
    }]
  }
}
```

### 4.2 에이전트 패널 토글

```json
{
  "bindings": {
    "cmd-shift-a": "agent::ToggleFocus"
  }
}
```

## 5. 사용 방법

### 5.1 에이전트 스레드 생성

1. **패널에서 생성**:
   - `Cmd+Shift+P` → "Agent: New Thread" → "Z.AI Agent" 선택

2. **키바인딩으로 생성**:
   - `Cmd+Alt+Z` (위 키바인딩 설정 시)

### 5.2 에이전트와 상호작용

1. **코드 질문**: 열린 파일이나 선택한 코드에 대해 질문
2. **파일 조작**: 파일 읽기, 쓰기, 편집 요청
3. **터미널 명령**: 터미널 명령어 실행 요청
4. **프로젝트 분석**: 전체 프로젝트 구조 분석 요청

## 6. Z.AI 모델 특징

### 6.1 지원 모델

- **GLM-4.6**: 고성능, 복잡한 작업에 적합
- **GLM-4.5-Air**: 빠른 응답, 간단한 작업에 적합

### 6.2 모델 매핑

Z.AI ACP는 자동으로 Claude 모델을 GLM 모델로 매핑:

- `claude-3-5-sonnet-20241022` → `glm-4.6`
- `claude-3-5-haiku-20241022` → `glm-4.5-air`
- `claude-3-opus-20240229` → `glm-4.6`

## 7. 문제 해결

### 7.1 일반적인 문제

#### 에이전트가 시작되지 않을 때
```bash
# 설치 확인
which z-ai-acp
z-ai-acp --version

# 권한 확인
chmod +x $(which z-ai-acp)
```

#### API 인증 오류
- API 키가 올바른지 확인
- `~/.config/z-ai-acp/managed-settings.json` 경로가 올바른지 확인
- 환경변수 설정 확인

### 7.2 디버깅

#### 로그 확인
```json
{
  "agent_servers": {
    "Z.AI Debug": {
      "type": "custom",
      "command": "z-ai-acp",
      "args": ["--acp", "--debug"],
      "env": {
        "CLAUDE_CODE_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## 8. 성능 최적화

### 8.1 캐싱 활성화

```json
{
  "zAi": {
    "enableCaching": true,
    "cacheTtl": 3600
  }
}
```

### 8.2 타임아웃 설정

```json
{
  "zAi": {
    "timeoutMs": 600000
  }
}
```

## 9. 보안 고려사항

- API 키를 소스 코드에 직접 포함하지 마세요
- `managed-settings.json` 파일 권한을 600으로 설정하세요
- 환경변수를 사용하는 경우 시스템 환경변수에 저장하세요

## 10. 추가 리소스

- [Zed 공식 문서 - External Agents](https://zed.dev/docs/ai/external-agents)
- [Agent Client Protocol (ACP) 명세](https://github.com/anthropics/agent-client-protocol)
- [Z.AI API 문서](https://docs.z.ai/api/anthropic)

## 완성된 설정 예시

```json
{
  "agent_servers": {
    "Z.AI Agent": {
      "type": "custom",
      "command": "z-ai-acp",
      "args": ["--acp"],
      "env": {}
    }
  },
  "bindings": {
    "cmd-alt-z": ["agent::NewExternalAgentThread", {
      "agent": {
        "custom": {
          "name": "Z.AI Agent",
          "command": {"command": "z-ai-acp", "args": ["--acp"]}
        }
      }
    }],
    "cmd-shift-a": "agent::ToggleFocus"
  }
}
```

이 설정으로 Zed Editor에서 Z.AI ACP 에이전트를 바로 사용할 수 있습니다!
