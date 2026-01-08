# Z.AI ACP 에이전트

[![npm](https://img.shields.io/npm/v/z-ai-acp)](https://www.npmjs.com/package/z-ai-acp)

[Z.AI](https://z.ai) 기반 코딩 에이전트를 [Zed](https://zed.dev)와 같은 [ACP 호환](https://agentclientprotocol.com) 클라이언트에서 사용하세요!

이 도구는 공식 [Claude Code SDK](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-overview)를 Z.AI 통합과 함께 사용하여 ACP 에이전트를 구현하며, 다음 기능을 지원합니다:

- 컨텍스트 @-멘션
- 이미지
- 도구 호출 (권한 요청 포함)
- 팔로잉
- 편집 검토
- TODO 목록
- 인터랙티브 (및 백그라운드) 터미널
- 커스텀 [슬래시 명령어](https://docs.anthropic.com/en/docs/claude-code/slash-commands)
- 클라이언트 MCP 서버
- Z.AI 모델 통합 (GLM 모델)

[Agent Client Protocol](https://agentclientprotocol.com/)에 대해 자세히 알아보세요.

## 설치 및 설정

### Zed 확장 프로그램을 통한 빠른 설정

1. **Zed 확장 프로그램 패널에서 설치**
2. **설치 후 API 키 구성**:

```bash
# 확장 프로그램 설치 후 터미널에서 이 명령어 실행
z-ai-acp --setup
```

이 명령어는 Z.AI API 키를 입력받아 자동으로 구성합니다.

### 수동 API 키 구성

수동으로 구성하려면 다음 방법으로 API 키를 설정할 수 있습니다:

**환경 변수:**
```bash
export ANTHROPIC_AUTH_TOKEN=your-z-ai-api-key
```

**또는 Zed 설정에서:**
```json
{
  "agent_servers": {
    "Z AI Agent": {
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-z-ai-api-key"
      }
    }
  }
}
```

## 사용 방법

### Zed 에디터

확장 프로그램을 설치하고 API 키를 구성한 후:

1. 에이전트 패널 열기 (**Cmd/Ctrl + Shift + A**)
2. `+` 버튼 메뉴에서 "New Claude Code Thread" 클릭
3. Z.AI 에이전트와 대화 시작!

![Zed Agent Panel](https://github.com/user-attachments/assets/ddce66c7-79ac-47a3-ad59-4a6a3ca74903)

### 독립 실행형 사용

커맨드 라인에서 에이전트를 직접 사용할 수도 있습니다:

```bash
# 인터랙티브 모드 (구성되지 않은 경우 API 키 입력 요청)
z-ai-acp

# 다른 도구와의 통합을 위한 ACP 모드
z-ai-acp --acp
```

### 기타 ACP 호환 클라이언트

- [agent-shell.el](https://github.com/xenodium/agent-shell)을 통한 Emacs
- [marimo notebook](https://github.com/marimo-team/marimo)
- Neovim
  - [CodeCompanion.nvim](https://codecompanion.olimorris.dev/configuration/adapters#setup-claude-code-via-acp)을 통해
  - [yetone/avante.nvim](https://github.com/yetone/avante.nvim)을 통해

[PR을 제출](https://github.com/softkr/z-ai-acp/pulls)하여 여러분의 클라이언트를 추가하세요!

## 주요 기능

### Z.AI 통합
- **GLM 모델**: Z.AI의 GLM 모델(GLM-4.7, GLM-4.5-air)을 자동으로 사용
- **한국어 최적화**: 한국어 및 컨텍스트에 대한 향상된 지원
- **비용 효율적**: 표준 Claude API보다 저렴

### 권한 모드
- **항상 묻기**: 각 도구의 첫 사용 시 권한 요청
- **편집 수락**: 파일 편집 권한을 자동으로 수락
- **계획 모드**: 파일을 수정하거나 명령을 실행하지 않고 분석
- **권한 우회**: 모든 권한 요청 건너뛰기 (루트 사용자 제외)

### 구성

에이전트는 다음 기본값으로 `~/.config/z-ai-acp/managed-settings.json`에 구성을 저장합니다:

```json
{
  "permissions": {
    "allow": ["*"],
    "deny": []
  },
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "Z_AI_MODEL_MAPPING": "true"
  },
  "z_ai": {
    "enabled": true,
    "api_endpoint": "https://api.z.ai/api/anthropic",
    "model_mapping": {
      "claude-4.5-sonnet-20250114": "glm-4.7",
      "claude-4-haiku-20250114": "glm-4.5-air",
      "claude-4-opus-20250114": "glm-4.7",
      "claude-3-5-sonnet-20241022": "glm-4.7",
      "claude-3-5-haiku-20241022": "glm-4.5-air",
      "claude-3-opus-20240229": "glm-4.7"
    }
  },
  "thinking": {
    "enabled": true,
    "max_tokens": 15000,
    "effort": "medium",
    "track_duration": true,
    "include_in_output": true
  },
  "auto": {
    "enabled": true,
    "model_selection": true,
    "thinking_adjustment": true
  }
}
```

### 확장 사고(Extended Thinking) 구성

에이전트는 Opus 및 GLM-4.6/4.7 모델을 위한 고급 사고 기능([Crush](https://github.com/charmbracelet/crush)에서 영감을 받음)을 지원합니다:

#### 구성 옵션

- **`enabled`** (boolean): 확장 사고 활성화/비활성화
  - 기본값: `true`

- **`max_tokens`** (number): 사고를 위해 할당된 최대 토큰
  - 기본값: `15000`

- **`effort`** (string): 토큰 예산 배수에 영향을 주는 추론 노력 수준
  - `"low"`: 0.5x max_tokens (기본값의 경우 7,500 토큰)
  - `"medium"`: 1.0x max_tokens (기본값의 경우 15,000 토큰)
  - `"high"`: 1.5x max_tokens (기본값의 경우 22,500 토큰)
  - 기본값: `"medium"`

- **`track_duration`** (boolean): 메타데이터에서 사고 시간 추적 및 보고
  - 기본값: `true`

- **`include_in_output`** (boolean): 최종 출력에 사고 내용 포함
  - 기본값: `true`

#### 구성 예시

```json
{
  "thinking": {
    "enabled": true,
    "max_tokens": 20000,
    "effort": "high",
    "track_duration": true
  }
}
```

이 구성은 Opus 또는 GLM-4.6/4.7 모델 사용 시 사고를 위해 30,000 토큰(20,000 × 1.5)을 할당합니다.

### 자동 모드 구성

에이전트는 프롬프트 복잡도 분석을 기반으로 자동 모델 선택 및 사고 조정을 지원합니다:

#### 작동 방식

1. **프롬프트 분석**: 복잡도 지표에 대한 프롬프트 분석:
   - 프롬프트 길이 및 구조
   - 코드 블록 및 파일 참조
   - 작업 유형 키워드(리팩토링, 디버깅, 아키텍처 등)
   - 언어별 키워드(영어, 한국어, 일본어)

2. **자동 모델 선택**: GLM-4.7과 GLM-4.5-air 중 선택:
   - **간단한 작업** (질문, 설명) → GLM-4.5-air (빠르고 비용 효율적)
   - **중간/복잡한 작업** (코드 생성, 리팩토링) → GLM-4.7 (더 강력함)

3. **자동 사고 조정**: 적절한 사고 노력 설정:
   - **간단함** → 낮은 노력 (5,000-10,000 토큰)
   - **중간** → 중간 노력 (15,000 토큰)
   - **복잡함** → 높은 노력 (20,000-30,000 토큰)

#### 구성 옵션

- **`enabled`** (boolean): 자동 모드 활성화/비활성화
  - 기본값: `true`

- **`model_selection`** (boolean): 복잡도에 따라 모델 자동 선택
  - 기본값: `true`

- **`thinking_adjustment`** (boolean): 사고 노력 자동 조정
  - 기본값: `true`

#### 구성 예시

```json
{
  "auto": {
    "enabled": true,
    "model_selection": true,
    "thinking_adjustment": true
  },
  "thinking": {
    "enabled": true,
    "max_tokens": 15000
  }
}
```

#### 작업 복잡도 예시

**간단한 작업** (GLM-4.5-air, 낮은 사고):
- "이 함수가 무엇을 하나요?"
- "async/await가 어떻게 작동하는지 설명해주세요"
- "...의 문법을 보여주세요"

**중간 작업** (GLM-4.7, 중간 사고):
- "이 함수에 에러 처리를 추가해주세요"
- "새로운 API 엔드포인트를 만들어주세요"
- "코드에서 이 버그를 수정해주세요"

**복잡한 작업** (GLM-4.7, 높은 사고):
- "전체 인증 시스템을 리팩토링해주세요"
- "...의 아키텍처를 설계해주세요"
- "여러 파일에 걸쳐 성능을 최적화해주세요"

자동 모드가 활성화되면 에이전트는 각 대화 시작 시 선택된 모델을 알려줍니다.

## 개발

```bash
# 의존성 설치
npm install

# 프로젝트 빌드
npm run build

# 린터 실행
npm run lint

# 코드 포맷팅
npm run format

# 테스트 실행
npm test

# 통합 테스트 실행
npm run test:integration

# 배포용 바이너리 생성
npm run build:binaries
```

## 성능 최적화

버전 0.0.24+에는 여러 성능 개선 사항이 포함되어 있습니다:

- **캐시된 Node 실행 파일 검색**: Node 실행 파일 경로가 캐시되어 반복적인 파일시스템 조회를 방지
- **최적화된 에러 처리**: 배열 기반 검사로 인증 에러 감지 통합
- **메모리 효율적인 문자열 연산**: 캐시된 정규식 패턴으로 마크다운 이스케이핑 개선
- **감소된 객체 할당**: 간소화된 에러 응답 및 세션 검사
- **타입 정의 최적화**: 더 나은 TypeScript 타입 추론으로 런타임 오버헤드 감소

## 문제 해결

### API 키 문제

인증 에러가 발생하는 경우:

```bash
# 저장된 API 키 삭제
z-ai-acp --clear-key

# 설정 다시 실행
z-ai-acp --setup
```

### 연결 문제

Z.AI 연결 확인:
- `ANTHROPIC_BASE_URL`이 `https://api.z.ai/api/anthropic`으로 설정되어 있는지 확인
- https://z.ai 에서 API 키가 유효한지 확인
- 네트워크 연결 및 방화벽 설정 확인

## 라이선스

Apache-2.0

---

## 자주 묻는 질문 (FAQ)

### Z.AI란 무엇인가요?

Z.AI는 한국어에 최적화된 GLM 모델을 제공하는 AI 플랫폼입니다. Claude API와 호환되는 인터페이스를 제공하면서 더 저렴한 비용으로 서비스를 이용할 수 있습니다.

### GLM 모델이란?

GLM(General Language Model)은 지푸AI(智谱AI)에서 개발한 대규모 언어 모델입니다. 이 에이전트는 다음 모델을 지원합니다:
- **GLM-4.7**: 복잡한 코딩 작업에 적합한 강력한 모델
- **GLM-4.5-air**: 간단한 질문과 설명에 적합한 빠르고 경제적인 모델

### Zed 이외의 에디터에서도 사용할 수 있나요?

네! 이 에이전트는 ACP(Agent Client Protocol)를 지원하는 모든 에디터나 도구에서 사용할 수 있습니다. 현재 Emacs, Neovim, marimo notebook 등이 지원됩니다.

### API 키는 어디서 받을 수 있나요?

Z.AI API 키는 [https://z.ai](https://z.ai)에서 계정을 만들고 받을 수 있습니다.

### 비용은 얼마나 드나요?

Z.AI는 표준 Claude API보다 저렴한 가격을 제공합니다. 정확한 가격은 [Z.AI 웹사이트](https://z.ai)에서 확인하세요.

### 한국어 코드 주석을 잘 이해하나요?

네! GLM 모델은 한국어에 최적화되어 있어 한국어 주석, 변수명, 문서를 잘 이해하고 생성할 수 있습니다.

## 기여하기

버그 리포트, 기능 제안, Pull Request를 환영합니다! [GitHub 저장소](https://github.com/softkr/z-ai-acp)에서 이슈를 열거나 PR을 제출해주세요.

## 지원

문제가 있으시면:
1. 이 문서의 문제 해결 섹션을 확인하세요
2. [GitHub Issues](https://github.com/softkr/z-ai-acp/issues)에서 유사한 문제를 검색하세요
3. 새로운 이슈를 열어 도움을 요청하세요
