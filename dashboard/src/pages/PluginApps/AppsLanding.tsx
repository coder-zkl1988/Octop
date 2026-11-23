import { useEffect, useState } from "react";
import { Card, Empty, List, Spin, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import PageShell from "../../layouts/PageShell";
import { pluginAppsApi, type PluginApp } from "../../api/modules/pluginApps";

export default function AppsLanding() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<PluginApp[] | null>(null);
  useEffect(() => {
    void pluginAppsApi
      .list()
      .then(setApps)
      .catch(() => setApps([]));
  }, []);
  return (
    <PageShell title="应用" subtitle="已安装的插件应用">
      {apps === null ? (
        <Spin />
      ) : apps.length === 0 ? (
        <Empty description="暂无可用应用" />
      ) : (
        <List
          grid={{ gutter: 16, column: 3 }}
          dataSource={apps}
          renderItem={(app) => (
            <List.Item>
              <Card
                hoverable
                onClick={() => navigate(`/apps/${encodeURIComponent(app.id)}`)}
                title={app.name}
              >
                <Typography.Text type="secondary">
                  {app.version ?? ""}
                </Typography.Text>
              </Card>
            </List.Item>
          )}
        />
      )}
    </PageShell>
  );
}
