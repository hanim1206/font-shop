# font-shop

@AGENTS.md

프로젝트 소개와 실행 방법은 `README.md`를 본다.

## 커밋

`new-font-maker`와 같은 규칙을 쓴다.

```
<type>(<scope>): <한글 제목>

<한글 본문: 무엇을, 왜>
```

- type: `feat` `fix` `docs` `style` `refactor` `test` `chore` `perf` `ci` `build`
- type과 scope는 영문, 제목과 본문은 한글로 쓴다. scope는 생략할 수 있다.
- 제목은 50자 안쪽 명령형(~추가, ~수정, ~삭제)으로 쓰고 끝에 마침표를 찍지 않는다.
- 제목과 본문은 빈 줄로 나눈다.
- AI 워터마크 · Co-Author를 넣지 않는다(`Co-Authored-By`, `Generated with Claude Code` 등).
- 전체 스테이징(`git add -A`, `git add .`, `git commit -a`)을 쓰지 않고 경로를 지정해 스테이징한다.
- `.env.local`과 `fonts/masters/`는 커밋하지 않는다.
