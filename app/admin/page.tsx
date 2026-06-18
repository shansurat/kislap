import { getNeo4jStats, getSyncLogs } from './actions';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminDashboardPage() {
  const [statsRes, logsRes] = await Promise.all([
    getNeo4jStats(),
    getSyncLogs()
  ]);

  const stats = statsRes.success && statsRes.data ? statsRes.data : { nodes: [], relationships: [] };
  const logs = logsRes.success && logsRes.data ? logsRes.data : [];

  const totalNodes = stats.nodes.reduce((acc: number, curr: any) => acc + curr.count, 0);
  const totalRelationships = stats.relationships.reduce((acc: number, curr: any) => acc + curr.count, 0);

  return (
    <div className="w-full">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-[#FFFFFF] tracking-tight mb-2">Admin Dashboard</h1>
        <p className="text-[#A3A3A3] text-sm">
          Overview of the Neo4j Graph database and recent synchronization logs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6">
          <h2 className="text-sm font-medium text-[#A3A3A3] uppercase tracking-wider mb-4">Graph Statistics</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-white/5">
              <span className="text-[#EFEFEF]">Total Nodes</span>
              <span className="text-2xl font-bold text-white">{totalNodes}</span>
            </div>
            {stats.nodes.map((node: any) => (
              <div key={node.label} className="flex justify-between items-center text-sm">
                <span className="text-[#888888]">{node.label}</span>
                <span className="text-[#EFEFEF]">{node.count}</span>
              </div>
            ))}
            
            <div className="flex justify-between items-center py-4 border-b border-t border-white/5 mt-4">
              <span className="text-[#EFEFEF]">Total Relationships</span>
              <span className="text-2xl font-bold text-white">{totalRelationships}</span>
            </div>
            {stats.relationships.map((rel: any) => (
              <div key={rel.type} className="flex justify-between items-center text-sm">
                <span className="text-[#888888]">{rel.type}</span>
                <span className="text-[#EFEFEF]">{rel.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-6 flex flex-col h-full">
          <h2 className="text-sm font-medium text-[#A3A3A3] uppercase tracking-wider mb-4">Recent Webhook Syncs</h2>
          <div className="flex-1 overflow-y-auto max-h-[400px] pr-2">
            {logs.length === 0 ? (
              <p className="text-sm text-[#888888]">No sync logs found.</p>
            ) : (
              <ul className="space-y-3">
                {logs.map((log: any) => (
                  <li key={log.id} className="text-sm bg-white/[0.01] border border-white/5 p-3 rounded-lg flex flex-col gap-1">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-[#EFEFEF]">
                        {log.operation_type} <span className="text-[#A3A3A3]">on</span> {log.table_name}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${log.status === 'SUCCESS' ? 'bg-green-950/30 text-green-400' : 'bg-red-950/30 text-red-400'}`}>
                        {log.status}
                      </span>
                    </div>
                    <div className="text-xs text-[#888888] flex justify-between">
                      <span>{log.record_id ? `Record: ${log.record_id.slice(0, 8)}...` : 'No record ID'}</span>
                      <span>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-red-400 mt-1">{log.error_message}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
