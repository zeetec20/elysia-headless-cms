import { Card, Col, Row, Statistic, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'

import { fetchPostsStats } from '@/api/statsApi'
import type { PayloadPostsStats } from '@/types'

const { Title, Text } = Typography

const DashboardPage = () => {
  const [stats, setStats] = useState<PayloadPostsStats | null>(null)
  const [statsError, setStatsError] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetchPostsStats()
      .then((result) => {
        setStats(result)
      })
      .catch((error) => {
        setStatsError(error instanceof Error ? error.message : 'Stats unavailable')
      })
  }, [])

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Total posts" value={stats?.totalPosts ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Published" value={stats?.byStatus.published ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Drafts" value={stats?.byStatus.draft ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Published share"
              value={stats?.metrics.publishedPercentage ?? 0}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>
      {statsError ? <Tag color="error">{statsError}</Tag> : null}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="Latest post">
            {stats?.latestPost ? (
              <>
                <Title level={5} style={{ margin: 0 }}>
                  {stats.latestPost.title}
                </Title>
                <Text type="secondary">
                  /{stats.latestPost.slug} · {stats.latestPost.status}
                </Text>
              </>
            ) : (
              <Text type="secondary">No posts yet</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default DashboardPage
