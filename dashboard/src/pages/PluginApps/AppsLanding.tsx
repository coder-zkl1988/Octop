import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Segmented,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import { useNavigate } from "react-router-dom";
import PageShell from "../../layouts/PageShell";
import { pluginAppsApi, type PluginApp } from "../../api/modules/pluginApps";
import {
  enterprisePluginsApi,
  pluginsApi,
  type EnterprisePlugin,
  type InstalledPlugin,
} from "../../api/modules/plugins";

const { Paragraph, Text } = Typography;

type Tab = "mine" | "market";
type Filter = "all" | "installable" | "installed";

interface Row {
  id: string;
  name: string;
  meta: string;
  summary: string;
  hasUi: boolean;
  installed: boolean;
  required: boolean;
  tools: string[];
  enabled: boolean;
  /** Market only: what the enterprise allows for this plugin. */
  item?: EnterprisePlugin;
}

const kindLabel = (kind: string) =>
  kind === "official" ? "官方" : kind === "third_party" ? "第三方" : "";

/** Installed apps and plugins, and the ones the enterprise allows this member to install. */
export default function AppsLanding() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("mine");
  const [filter, setFilter] = useState<Filter>("all");
  const [apps, setApps] = useState<PluginApp[] | null>(null);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [allowed, setAllowed] = useState<{
    enforced: boolean;
    items: EnterprisePlugin[];
  }>({ enforced: false, items: [] });
  const [busy, setBusy] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [installing, setInstalling] = useState<{
    row: Row;
    enable: boolean;
  } | null>(null);
  const [asking, setAsking] = useState<{ row: Row; reason: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const [appList, pluginList, enterprise] = await Promise.all([
      pluginAppsApi.list().catch(() => [] as PluginApp[]),
      pluginsApi.list().catch(() => [] as InstalledPlugin[]),
      // Not signed in to an enterprise, or it set no list: nothing is restricted.
      enterprisePluginsApi
        .list()
        .catch(() => ({ enforced: false, items: [] as EnterprisePlugin[] })),
    ]);
    setApps(appList);
    setInstalled(pluginList.filter((p) => !p.error));
    setAllowed(enterprise);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(
    () => Object.fromEntries(allowed.items.map((i) => [i.id, i])),
    [allowed],
  );

  const mine: Row[] = useMemo(() => {
    const appIds = new Set((apps ?? []).map((a) => a.id));
    const fromApps = (apps ?? []).map((a) =>
      rowOf(a.id, a.name, a.version, true),
    );
    const fromPlugins = installed
      .filter((p) => !appIds.has(p.id) && p.enabled !== false)
      .map((p) => rowOf(p.id, p.name ?? p.id, p.version, Boolean(p.ui?.entry)));
    return [...fromApps, ...fromPlugins];

    function rowOf(
      id: string,
      name: string,
      version: string | number | undefined,
      hasUi: boolean,
    ): Row {
      const plugin = installed.find((p) => p.id === id);
      const item = byId[id];
      return {
        id,
        name: item?.name || name,
        meta: [kindLabel(item?.kind ?? ""), version ? `v${version}` : ""]
          .filter(Boolean)
          .join(" · "),
        summary: item?.summary || plugin?.description || "",
        hasUi,
        installed: true,
        required: Boolean(item?.required),
        tools: (plugin?.tools ?? []).map((t) => t.name),
        enabled: plugin?.enabled !== false,
      };
    }
  }, [apps, installed, byId]);

  const market: Row[] = useMemo(
    () =>
      allowed.items
        .filter((i) => !i.builtin)
        .map((i) => ({
          id: i.id,
          name: i.name,
          meta: [kindLabel(i.kind), i.version ? `v${i.version}` : ""]
            .filter(Boolean)
            .join(" · "),
          summary: i.summary,
          hasUi: Boolean(installed.find((p) => p.id === i.id)?.ui?.entry),
          installed: i.installed,
          required: i.required,
          tools: (installed.find((p) => p.id === i.id)?.tools ?? []).map(
            (t) => t.name,
          ),
          enabled: i.enabled,
          item: i,
        }))
        .filter(
          (r) =>
            filter === "all" ||
            (filter === "installed"
              ? r.installed
              : !r.installed && r.item?.installable !== false),
        ),
    [allowed, installed, filter],
  );

  const install = async (row: Row, enable: boolean) => {
    setBusy(row.id);
    try {
      await enterprisePluginsApi.install(row.id, enable);
      message.success(
        enable ? `${row.name} 已安装并启用` : `${row.name} 已安装，还没有启用`,
      );
      setInstalling(null);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "安装失败");
    } finally {
      setBusy("");
    }
  };

  const ask = async () => {
    if (!asking) return;
    setBusy(asking.row.id);
    try {
      await enterprisePluginsApi.request(asking.row.id, asking.reason.trim());
      message.success("申请已提交，管理员同意后会远程启用到这台电脑");
      setAsking(null);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy("");
    }
  };

  const uninstall = async (row: Row) => {
    setBusy(row.id);
    try {
      await pluginsApi.uninstall(row.id);
      message.success(`${row.name} 已卸载`);
      setRemoving(null);
      setDetail(null);
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "卸载失败");
    } finally {
      setBusy("");
    }
  };

  const open = (row: Row) =>
    row.hasUi
      ? navigate(`/apps/${encodeURIComponent(row.id)}`)
      : setDetail(row);

  const card = (row: Row) => (
    <Card key={row.id} size="small" style={{ height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Text strong>{row.name}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.meta}
            </Text>
          </div>
        </div>
        {row.required ? (
          <Tag color="blue">管理员已启用</Tag>
        ) : row.installed ? (
          <Tag>已安装</Tag>
        ) : row.item?.installable === false ? (
          <Tag color="orange">需管理员启用</Tag>
        ) : null}
      </div>
      <Paragraph
        type="secondary"
        ellipsis={{ rows: 2 }}
        style={{ margin: "8px 0 12px", minHeight: 44 }}
      >
        {row.summary || "这个插件没有填写说明。"}
      </Paragraph>
      {row.item?.request?.status === "rejected" && (
        <Paragraph type="danger" style={{ fontSize: 12, marginTop: -6 }}>
          管理员没有同意
          {row.item.request.note ? `：${row.item.request.note}` : "。"}
        </Paragraph>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {row.installed ? (
          <Button size="small" type="primary" onClick={() => open(row)}>
            打开
          </Button>
        ) : row.item?.installable === false ? (
          row.item.request?.status === "pending" ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              已申请，等管理员处理
            </Text>
          ) : (
            <Button
              size="small"
              type="primary"
              onClick={() => setAsking({ row, reason: "" })}
            >
              {row.item.request?.status === "rejected"
                ? "重新申请"
                : "申请启用"}
            </Button>
          )
        ) : (
          <Button
            size="small"
            type="primary"
            loading={busy === row.id}
            onClick={() => setInstalling({ row, enable: true })}
          >
            安装
          </Button>
        )}
        {!row.installed && row.item && (
          <Button size="small" onClick={() => setDetail(row)}>
            查看详情
          </Button>
        )}
        {row.installed &&
          (row.required ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              由管理员远程启用，不能卸载
            </Text>
          ) : (
            row.id !== "xhs-ops" && (
              <Button size="small" onClick={() => setRemoving(row)}>
                卸载
              </Button>
            )
          ))}
      </div>
    </Card>
  );

  const grid = (rows: Row[]) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}
    >
      {rows.map(card)}
    </div>
  );

  return (
    <PageShell
      title="应用"
      subtitle="已安装的应用与插件。你可以从企业允许的清单里自行安装，管理员也可以远程为你启用。"
      actions={
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "mine", label: "我的应用" },
            { value: "market", label: "插件市场" },
          ]}
        />
      }
    >
      {apps === null ? (
        <Spin />
      ) : tab === "mine" ? (
        mine.length === 0 ? (
          <Empty description="还没有安装应用。去「插件市场」看看企业允许安装的插件。" />
        ) : (
          <>
            {grid(mine)}
            {mine.some((r) => r.required) && (
              <Alert
                style={{ marginTop: 16 }}
                type="info"
                message="「管理员已启用」的应用由企业管理员远程下发到这台电脑，随企业策略更新，不能卸载。"
              />
            )}
          </>
        )
      ) : (
        <>
          <Segmented<Filter>
            style={{ marginBottom: 16 }}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "全部" },
              { value: "installable", label: "可安装" },
              { value: "installed", label: "已安装" },
            ]}
          />
          {market.length === 0 ? (
            <Empty
              description={
                allowed.enforced
                  ? "这个分类下没有插件"
                  : "企业还没有设置允许安装的插件清单"
              }
            />
          ) : (
            grid(market)
          )}
          <Alert
            style={{ marginTop: 16 }}
            type="info"
            message="这里只显示企业允许安装的插件。没有看到需要的插件？请联系企业管理员把它加入允许清单。"
          />
        </>
      )}

      <Modal
        open={!!detail}
        title={detail?.name}
        onCancel={() => setDetail(null)}
        footer={
          detail && !detail.installed ? (
            <>
              <Button onClick={() => setDetail(null)}>关闭</Button>
              {detail.item?.installable === false ? (
                detail.item.request?.status !== "pending" && (
                  <Button
                    type="primary"
                    onClick={() => {
                      setAsking({ row: detail, reason: "" });
                      setDetail(null);
                    }}
                  >
                    申请启用
                  </Button>
                )
              ) : (
                <Button
                  type="primary"
                  onClick={() => {
                    setInstalling({ row: detail, enable: true });
                    setDetail(null);
                  }}
                >
                  安装
                </Button>
              )}
            </>
          ) : (
            <>
              {detail && !detail.required && detail.id !== "xhs-ops" && (
                <Button onClick={() => setRemoving(detail)}>卸载</Button>
              )}
              <Button onClick={() => setDetail(null)}>关闭</Button>
              <Button type="primary" onClick={() => navigate("/")}>
                去对话里使用
              </Button>
            </>
          )
        }
      >
        {detail &&
          (detail.installed ? (
            <>
              <Descriptions
                column={1}
                size="small"
                items={[
                  {
                    key: "state",
                    label: "状态",
                    children: detail.enabled ? "已启用" : "已停用",
                  },
                  {
                    key: "tools",
                    label: "工具",
                    children: detail.tools.join("、") || "没有声明工具",
                  },
                ]}
              />
              <Paragraph type="secondary" style={{ marginTop: 12 }}>
                这个插件没有自己的界面。启用后，专家会在对话里按需调用它的工具。
              </Paragraph>
            </>
          ) : (
            detail.item && <PluginFacts item={detail.item} />
          ))}
      </Modal>

      <Modal
        open={!!installing}
        title={`安装 ${installing?.row.name ?? ""}`}
        okText="安装"
        cancelText="取消"
        okButtonProps={{ loading: busy === installing?.row.id }}
        onCancel={() => setInstalling(null)}
        onOk={() =>
          installing && void install(installing.row, installing.enable)
        }
      >
        {installing?.row.item && (
          <>
            <PluginFacts item={installing.row.item} />
            <div style={{ marginTop: 12 }}>
              <Text>安装后</Text>
              <div style={{ marginTop: 6 }}>
                <Segmented<"on" | "off">
                  value={installing.enable ? "on" : "off"}
                  onChange={(v) =>
                    setInstalling({ ...installing, enable: v === "on" })
                  }
                  options={[
                    { value: "on", label: "启用到所有专家" },
                    { value: "off", label: "先不启用" },
                  ]}
                />
              </div>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!asking}
        title="申请启用"
        okText="提交申请"
        cancelText="取消"
        okButtonProps={{
          loading: busy === asking?.row.id,
          disabled: !asking?.reason.trim(),
        }}
        onCancel={() => setAsking(null)}
        onOk={() => void ask()}
      >
        {asking && (
          <>
            <Paragraph type="secondary">
              管理员同意后会远程启用到这台电脑。
            </Paragraph>
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: "plugin", label: "插件", children: asking.row.name },
              ]}
            />
            <Input.TextArea
              style={{ marginTop: 12 }}
              rows={3}
              maxLength={300}
              aria-label="用途"
              placeholder="告诉管理员你想用它做什么"
              value={asking.reason}
              onChange={(e) => setAsking({ ...asking, reason: e.target.value })}
            />
          </>
        )}
      </Modal>

      <Modal
        open={!!removing}
        title={`卸载 ${removing?.name ?? ""}`}
        okText="卸载"
        okButtonProps={{ danger: true, loading: busy === removing?.id }}
        cancelText="取消"
        onCancel={() => setRemoving(null)}
        onOk={() => removing && void uninstall(removing)}
      >
        卸载后专家不能再使用这个插件的工具，插件产生的文件保留。可以随时重新安装。
      </Modal>
    </PageShell>
  );
}

const SCAN_LABEL: Record<string, string> = {
  pass: "扫描通过",
  hint: "有提示项",
  high: "高风险",
};

/** What a member should know before installing or asking for a plugin. */
function PluginFacts({ item }: { item: EnterprisePlugin }) {
  const allowedTools = item.tools.filter((t) => !item.toolsDenied.includes(t));
  return (
    <Descriptions
      column={1}
      size="small"
      items={[
        {
          key: "version",
          label: "版本",
          children: [item.version && `v${item.version}`, kindLabel(item.kind)]
            .filter(Boolean)
            .join(" · "),
        },
        {
          key: "scan",
          label: "安全扫描",
          children: SCAN_LABEL[item.scan] ?? "—",
        },
        {
          key: "tools",
          label: "会用到的工具",
          children: allowedTools.join("、") || "插件包里没有找到工具名",
        },
        {
          key: "limits",
          label: "企业限制",
          children: item.toolsDenied.length
            ? `企业关闭了 ${item.toolsDenied.join("、")}，专家看不到这些工具`
            : "没有额外限制",
        },
      ]}
    />
  );
}
