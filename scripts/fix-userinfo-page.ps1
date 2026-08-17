$file = 'app\userInfo\page.tsx'
$c = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)

# 1. LINE_KEYS에 ARAM 추가
$q = [char]34
$old1 = "const LINE_KEYS = [${q}TOP${q}, ${q}JG${q}, ${q}MID${q}, ${q}ADC${q}, ${q}SUP${q}] as const;"
$new1 = "const LINE_KEYS = [${q}TOP${q}, ${q}JG${q}, ${q}MID${q}, ${q}ADC${q}, ${q}SUP${q}, ${q}ARAM${q}] as const;"
Write-Host "LINE_KEYS contains: $($c.Contains($old1))"
$c = $c.Replace($old1, $new1)

# 2. Member 인터페이스 rookieSessionLogs 타입에 members, startAt 추가
$old2 = "rookieSessionLogs?: { games: number; partyCount: number; comment: string; date: string; mode: string }[];"
$new2 = "rookieSessionLogs?: { games: number; partyCount: number; comment: string; date: string; startAt: string; mode: string; members: string[] }[];"
Write-Host "rookieSessionLogs contains: $($c.Contains($old2))"
$c = $c.Replace($old2, $new2)

# 3. rookieLogModal state 타입에 members, startAt 추가
$old3 = "useState<{ nickname: string; logs: { games: number; partyCount: number; comment: string; date: string; mode: string }[] } | null>(null);"
$new3 = "useState<{ nickname: string; logs: { games: number; partyCount: number; comment: string; date: string; startAt: string; mode: string; members: string[] }[] } | null>(null);"
Write-Host "rookieLogModal contains: $($c.Contains($old3))"
$c = $c.Replace($old3, $new3)

# 4. 수습 닉네임 색상 - 기존 단순 닉네임 td를 색상 로직으로 교체
$old4 = "                    <td style={{ padding: `"8px 10px`", fontWeight: 700 }}>{m.nickname}</td>"
$new4 = @"
                    <td style={{ padding: "8px 10px", fontWeight: 700 }}>
                      {(() => {
                        const cnt = m.rookiePartyCount ?? 0;
                        const canPromote = cnt >= 3;
                        const createdAt = m.createdAt ? new Date(m.createdAt) : null;
                        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                        const overdue = createdAt && createdAt < oneWeekAgo && !canPromote;
                        const color = canPromote ? '#2ecc71' : overdue ? '#f1948a' : 'var(--text)';
                        return <span style={{ color }}>{m.nickname}</span>;
                      })()}
                    </td>
"@
Write-Host "nickname td contains: $($c.Contains($old4))"
$c = $c.Replace($old4, $new4)

# 5. 수습 로그 모달 테이블을 카드 형식으로 변경
$old5 = @"
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>날짜</th>
                  <th style={{ textAlign: "center", padding: "4px 8px" }}>모드</th>
                  <th style={{ textAlign: "center", padding: "4px 8px" }}>횟수</th>
                </tr>
              </thead>
              <tbody>
                {rookieLogModal.logs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", color: "var(--muted)" }}>{log.date}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>{({ flex: "자유랭크", scrim: "내전" } as any)[log.mode] ?? log.mode}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{log.partyCount ?? log.games}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
"@
$new5 = @"
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rookieLogModal.logs.map((log, i) => (
                <div key={i} style={{ background: "var(--card-2)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{log.startAt || log.date}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: "rgba(83,131,232,0.18)", color: "#7aa2f7" }}>{log.partyCount ?? log.games}회 참여</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(log.members ?? []).length > 0 ? log.members.map((nick: string) => (
                      <span key={nick} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: "var(--card)", color: "var(--text)" }}>{nick}</span>
                    )) : <span style={{ fontSize: 12, color: "var(--muted)" }}>클랜원 정보 없음</span>}
                  </div>
                </div>
              ))}
            </div>
"@
Write-Host "modal table contains: $($c.Contains($old5))"
$c = $c.Replace($old5, $new5)

# 6. 주라인 select에 ARAM 옵션 추가 (SUP 다음에)
# 첫 번째 SUP 옵션 (주라인 select) 뒤에만 추가
$old6 = "                  <option value=${q}SUP${q}>SUP</option>`r`n                </select>`r`n              </div>`r`n              <div style={{ display: ${q}flex${q}, flexDirection: ${q}column${q}, gap: 4 }}>`r`n                <label style={{ fontSize: 11, color: ${q}var(--muted)${q} }}>부라인</label>"
$new6 = "                  <option value=${q}SUP${q}>SUP</option>`r`n                  <option value=${q}ARAM${q}>ARAM</option>`r`n                </select>`r`n              </div>`r`n              <div style={{ display: ${q}flex${q}, flexDirection: ${q}column${q}, gap: 4 }}>`r`n                <label style={{ fontSize: 11, color: ${q}var(--muted)${q} }}>부라인</label>"
Write-Host "SUP option contains: $($c.Contains($old6))"
$c = $c.Replace($old6, $new6)

[IO.File]::WriteAllText($file, $c, [Text.Encoding]::UTF8)
Write-Host "File saved."
Write-Host "ARAM in result: $($c.Contains('ARAM'))"
Write-Host "members field: $($c.Contains('members: string[]'))"
Write-Host "oneWeekAgo: $($c.Contains('oneWeekAgo'))"
Write-Host "log.startAt: $($c.Contains('log.startAt'))"
