import { useState, useEffect } from 'react';
import './App.css';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import {
  Button,
  Card,
  Modal,
  TextField,
  Label,
  Input,
  TextArea,
  Select,
  ListBox,
  Chip,
  Spinner,
  Checkbox,
  Description
} from '@heroui/react';

const API_ENDPOINT = window.APP_CONFIG?.API_ENDPOINT || 'http://localhost:3000';
const API_KEY = window.APP_CONFIG?.API_KEY || '';

function App() {
  const [tenantId, setTenantId] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState('');
  const [deployedAgent, setDeployedAgent] = useState(null);
  const [tokenUsage, setTokenUsage] = useState([]);
  const [agents, setAgents] = useState([]);
  const [deployLoading, setDeployLoading] = useState(false);
  const [invokeLoading, setInvokeLoading] = useState(false);
  const [invokeMessage, setInvokeMessage] = useState('');
  const [invokeResponse, setInvokeResponse] = useState('');
  const [selectedAgentForInvoke, setSelectedAgentForInvoke] = useState(null);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [agentConfig, setAgentConfig] = useState({
    modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    systemPrompt: 'You are a helpful AI assistant.',
    customSettings: {}
  });
  const [useCustomTemplate, setUseCustomTemplate] = useState(false);
  const [templateConfig, setTemplateConfig] = useState({
    source: 'github',
    repo: '',
    path: 'templates/main.py',
    branch: 'main',
    token: ''
  });
  const [availableTools, setAvailableTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolsRepo, setToolsRepo] = useState('');
  const [agentsSortConfig, setAgentsSortConfig] = useState({ key: null, direction: 'asc' });
  const [usageSortConfig, setUsageSortConfig] = useState({ key: null, direction: 'asc' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deploymentNotification, setDeploymentNotification] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const fetchTokenUsage = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINT}/usage`, {
        headers: { 'x-api-key': API_KEY }
      });
      const data = Array.isArray(response.data) ? response.data : JSON.parse(response.data);
      setTokenUsage(data || []);
    } catch (error) {
      console.error('Error fetching token usage:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINT}/agents`, {
        headers: { 'x-api-key': API_KEY }
      });
      const data = Array.isArray(response.data) ? response.data : JSON.parse(response.data);
      setAgents(data || []);
      if (data && data.length > 0 && !selectedAgentForInvoke) {
        setSelectedAgentForInvoke(data[0]);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const extractRepoPath = (repoInput) => {
    if (!repoInput) return '';
    if (repoInput.match(/^[^\/]+\/[^\/]+$/)) return repoInput;
    const match = repoInput.match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (match) return match[1].replace(/\.git$/, '');
    return repoInput;
  };

  const fetchToolCatalog = async () => {
    if (!toolsRepo) {
      setAvailableTools([]);
      return;
    }
    setLoadingTools(true);
    try {
      const repoPath = extractRepoPath(toolsRepo);
      const branch = templateConfig.branch || 'main';
      const url = `https://api.github.com/repos/${repoPath}/contents/catalog.json?ref=${branch}`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (templateConfig.token) headers['Authorization'] = `token ${templateConfig.token}`;
      const response = await axios.get(url, { headers });
      const content = atob(response.data.content);
      const catalog = JSON.parse(content);
      setAvailableTools(catalog.tools || []);
    } catch (error) {
      console.error('Error fetching tool catalog:', error);
      setAvailableTools([]);
      alert('Failed to fetch tool catalog.');
    } finally {
      setLoadingTools(false);
    }
  };

  const toggleToolSelection = (tool) => {
    const isSelected = selectedTools.some(t => t.id === tool.id);
    if (isSelected) {
      setSelectedTools(selectedTools.filter(t => t.id !== tool.id));
    } else {
      setSelectedTools([...selectedTools, { ...tool, config: {} }]);
    }
  };

  const deleteAgent = async (tenantId, agentRuntimeId, agentName) => {
    if (!window.confirm(`Delete agent "${agentName}" for tenant: ${tenantId}?`)) return;
    try {
      await axios.delete(`${API_ENDPOINT}/agent?tenantId=${tenantId}&agentRuntimeId=${agentRuntimeId}`);
      alert(`Agent "${agentName}" deleted successfully`);
      fetchAgents();
      if (selectedAgentForInvoke?.agentRuntimeId === agentRuntimeId) setSelectedAgentForInvoke(null);
      if (deployedAgent?.agentRuntimeId === agentRuntimeId) {
        setDeployedAgent(null);
        setDeploymentStatus('');
      }
    } catch (error) {
      alert(`Error deleting agent: ${error.response?.data?.error || error.message}`);
    }
  };

  const sortData = (data, sortConfig) => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      let aVal = a[sortConfig.key], bVal = b[sortConfig.key];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (sortConfig.key === 'deployedAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase(), bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleAgentsSort = (key) => {
    setAgentsSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleUsageSort = (key) => {
    setUsageSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIndicator = (columnKey, sortConfig) => {
    if (sortConfig.key !== columnKey) return ' ↕️';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  useEffect(() => {
    fetchTokenUsage();
    fetchAgents();
    const interval = setInterval(() => {
      fetchTokenUsage();
      fetchAgents();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const deployAgent = async () => {
    if (!tenantId) {
      alert('Please enter a Tenant ID');
      return;
    }
    setDeployLoading(true);
    setDeploymentStatus('Starting agent deployment...');
    try {
      const payload = { config: agentConfig };
      if (useCustomTemplate && templateConfig.repo) {
        payload.template = {
          source: 'github',
          repo: extractRepoPath(templateConfig.repo),
          path: templateConfig.path || 'templates/main.py',
          branch: templateConfig.branch || 'main',
          token: templateConfig.token || undefined
        };
      }
      if (selectedTools.length > 0 && toolsRepo) {
        payload.tools = {
          repo: extractRepoPath(toolsRepo),
          branch: templateConfig.branch || 'main',
          selected: selectedTools.map(tool => ({ id: tool.id, config: tool.config || {} }))
        };
      }
      const response = await axios.post(
        `${API_ENDPOINT}/deploy?tenantId=${tenantId}`,
        payload,
        { headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      if (response.status === 202 || data.status === 'deploying') {
        setIsModalOpen(false);
        setDeploymentNotification({ tenantId, status: 'deploying', message: `Deploying agent for tenant: ${tenantId}...` });
        setDeploymentStatus('');
        setDeployedAgent({ tenantId, status: 'deploying', note: 'Agent is being deployed in the background' });
        let pollCount = 0;
        const maxPolls = 36;
        const pollInterval = setInterval(async () => {
          pollCount++;
          try {
            const agentResponse = await axios.get(`${API_ENDPOINT}/agent?tenantId=${tenantId}`);
            if (agentResponse.status === 200 && agentResponse.data) {
              clearInterval(pollInterval);
              setDeployedAgent(agentResponse.data);
              setDeploymentNotification(null);
              fetchAgents();
              fetchTokenUsage();
            }
          } catch (error) {
            if (error.response?.status !== 404) console.error('Error polling:', error);
          }
          fetchTokenUsage();
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setDeploymentNotification({ tenantId, status: 'timeout', message: 'Deployment taking longer than expected.' });
            setTimeout(() => setDeploymentNotification(null), 10000);
          }
        }, 5000);
      } else {
        setDeployedAgent(data);
        setIsModalOpen(false);
        setDeploymentNotification({ tenantId, status: 'success', message: `Agent deployed successfully!` });
        setTimeout(() => setDeploymentNotification(null), 5000);
      }
      fetchTokenUsage();
    } catch (error) {
      setDeploymentStatus(error.code === 'ECONNABORTED' ? 'Request timeout.' : `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeployLoading(false);
    }
  };

  const invokeAgent = async () => {
    if (!selectedAgentForInvoke || !invokeMessage) {
      alert('Please select an agent and enter a message');
      return;
    }
    setInvokeLoading(true);
    setInvokeResponse('Invoking agent...');
    try {
      const response = await axios.post(
        `${API_ENDPOINT}/invoke`,
        { agentId: selectedAgentForInvoke.agentRuntimeArn, inputText: invokeMessage, sessionId: `session-${Date.now()}` },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      const extractText = (obj) => {
        if (typeof obj === 'string') {
          if (obj.trim().startsWith('{') || obj.trim().startsWith('[')) {
            try { obj = JSON.parse(obj); } catch (e) {
              try { obj = JSON.parse(obj.replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false').replace(/None/g, 'null')); } catch (e2) { return obj; }
            }
          } else return obj;
        }
        if (typeof obj === 'object' && obj !== null) {
          if (obj.result) return extractText(obj.result);
          if (obj.role && obj.content) return extractText(obj.content);
          if (Array.isArray(obj.content)) return obj.content.map(item => typeof item === 'string' ? item : item.text || '').filter(Boolean).join('\n\n');
          if (Array.isArray(obj)) return obj.map(item => typeof item === 'string' ? item : item.text || extractText(item)).filter(Boolean).join('\n\n');
          if (obj.text) return obj.text;
          if (obj.message) return extractText(obj.message);
          if (obj.completion) return extractText(obj.completion);
        }
        return typeof obj === 'string' ? obj : JSON.stringify(obj);
      };
      let responseText = extractText(response.data).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      setInvokeResponse(responseText);
      setTimeout(() => fetchTokenUsage(), 2000);
    } catch (error) {
      setInvokeResponse(`Error: ${error.response?.data?.error || error.message || 'Unknown error'}`);
    } finally {
      setInvokeLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const s = status?.toLowerCase();
    if (s === 'ready' || s === 'READY') return 'success';
    if (s === 'deploying' || s === 'CREATING') return 'warning';
    if (s === 'failed' || s === 'FAILED') return 'danger';
    return 'default';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-separator bg-surface px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex-1" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">✨ Bedrock Agent Dashboard</h1>
            <p className="text-sm text-muted">Deploy and manage your AI agents</p>
          </div>
          <div className="flex-1 flex items-center justify-end">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center hover:border-accent transition-colors ${isDarkMode ? 'border-gray-500' : 'border-separator'}`}
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6 space-y-6">
        {/* Notification Banner */}
        {deploymentNotification && (
          <div className={`flex items-center justify-between rounded-xl p-4 ${
            deploymentNotification.status === 'deploying' ? 'bg-accent-soft' :
            deploymentNotification.status === 'success' ? 'bg-success-soft' : 'bg-warning-soft'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-xl">
                {deploymentNotification.status === 'deploying' && '🔄'}
                {deploymentNotification.status === 'success' && '✅'}
                {deploymentNotification.status === 'timeout' && '⏱️'}
              </span>
              <span className="font-medium">{deploymentNotification.message}</span>
            </div>
            <Button variant="ghost" size="sm" isIconOnly onPress={() => setDeploymentNotification(null)}>×</Button>
          </div>
        )}

        {/* Deploy Button */}
        <Button onPress={() => setIsModalOpen(true)} size="lg" variant="primary">➕ Deploy New Agent</Button>

        {/* Invoke Agent Card */}
        <Card>
          <Card.Header>
            <Card.Title>Invoke Agent</Card.Title>
            <Card.Description>Send messages to your deployed agents</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-4">
            <Select
              className="w-full"
              placeholder="Select an agent"
              isDisabled={invokeLoading || agents.length === 0}
              value={selectedAgentForInvoke?.agentRuntimeId || ''}
              onChange={(key) => setSelectedAgentForInvoke(agents.find(a => a.agentRuntimeId === key))}
            >
              <Label>Select Agent</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {agents.length === 0 ? (
                    <ListBox.Item id="none" textValue="No agents">No agents available<ListBox.ItemIndicator /></ListBox.Item>
                  ) : agents.map((agent) => (
                    <ListBox.Item key={agent.agentRuntimeId} id={agent.agentRuntimeId} textValue={`${agent.tenantId} - ${agent.agentName || 'Unnamed'}`}>
                      {agent.tenantId} - {agent.agentName || 'Unnamed'} ({agent.status || 'unknown'})
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            {selectedAgentForInvoke && (
              <div className="rounded-lg bg-surface-secondary p-4 space-y-1">
                <p className="text-sm"><span className="font-medium">Selected:</span> {selectedAgentForInvoke.agentName || selectedAgentForInvoke.tenantId}</p>
                <p className="text-sm"><span className="font-medium">Tenant:</span> {selectedAgentForInvoke.tenantId}</p>
                <p className="text-sm flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  <Chip size="sm" color={getStatusColor(selectedAgentForInvoke.status)}>{selectedAgentForInvoke.status || 'unknown'}</Chip>
                </p>
              </div>
            )}

            <TextField className="w-full" onChange={setInvokeMessage}>
              <Label>Message</Label>
              <TextArea
                placeholder="Enter your message to the agent..."
                rows={4}
                value={invokeMessage}
                disabled={invokeLoading || !selectedAgentForInvoke}
              />
            </TextField>

            <Button onPress={invokeAgent} isDisabled={invokeLoading || !selectedAgentForInvoke} isPending={invokeLoading} variant="primary">
              {({ isPending }) => isPending ? <><Spinner size="sm" color="current" /> Invoking...</> : 'Invoke Agent'}
            </Button>

            {invokeResponse && (
              <div className="rounded-lg bg-surface-secondary p-4">
                <h3 className="font-semibold mb-2">Response:</h3>
                <div className="whitespace-pre-wrap font-mono text-sm">{invokeResponse}</div>
              </div>
            )}
          </Card.Content>
        </Card>

        {/* Active Agents Card */}
        <Card>
          <Card.Header className="flex flex-row items-center justify-between">
            <div>
              <Card.Title>Active Agents</Card.Title>
              <Card.Description>Manage your deployed agents</Card.Description>
            </div>
            <Button variant="secondary" size="sm" onPress={fetchAgents}>Refresh</Button>
          </Card.Header>
          <Card.Content>
            {agents.length === 0 ? (
              <p className="text-center text-muted py-8">No active agents found.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleAgentsSort('tenantId')}>
                        Tenant ID{getSortIndicator('tenantId', agentsSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleAgentsSort('agentName')}>
                        Agent Name{getSortIndicator('agentName', agentsSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleAgentsSort('agentRuntimeId')}>
                        Agent ID{getSortIndicator('agentRuntimeId', agentsSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleAgentsSort('status')}>
                        Status{getSortIndicator('status', agentsSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleAgentsSort('deployedAt')}>
                        Deployed At{getSortIndicator('deployedAt', agentsSortConfig)}
                      </th>
                      <th className="px-4 py-3 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortData(agents, agentsSortConfig).map((agent) => (
                      <tr key={agent.agentRuntimeId} className="hover:bg-surface-secondary">
                        <td className="px-4 py-3 font-medium">{agent.tenantId}</td>
                        <td className="px-4 py-3">{agent.agentName || 'N/A'}</td>
                        <td className="px-4 py-3"><code className="text-xs bg-surface-tertiary px-2 py-1 rounded">{agent.agentRuntimeId || 'N/A'}</code></td>
                        <td className="px-4 py-3"><Chip size="sm" color={getStatusColor(agent.status)}>{agent.status || 'unknown'}</Chip></td>
                        <td className="px-4 py-3">{agent.deployedAt ? new Date(agent.deployedAt).toLocaleString() : 'N/A'}</td>
                        <td className="px-4 py-3">
                          <Button variant="danger" size="sm" onPress={() => deleteAgent(agent.tenantId, agent.agentRuntimeId, agent.agentName)}>🗑️ Delete</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card.Content>
        </Card>

        {/* Token Usage Card */}
        <Card>
          <Card.Header className="flex flex-row items-center justify-between">
            <div>
              <Card.Title>Token Usage by Tenant</Card.Title>
              <Card.Description>Monitor token consumption and costs</Card.Description>
            </div>
            <Button variant="secondary" size="sm" onPress={fetchTokenUsage}>Refresh</Button>
          </Card.Header>
          <Card.Content className="space-y-6">
            {tokenUsage.length === 0 ? (
              <p className="text-center text-muted py-8">No token usage data available yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-secondary">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleUsageSort('tenant_id')}>
                          Tenant ID{getSortIndicator('tenant_id', usageSortConfig)}
                        </th>
                        <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleUsageSort('input_tokens')}>
                          Input Tokens{getSortIndicator('input_tokens', usageSortConfig)}
                        </th>
                        <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleUsageSort('output_tokens')}>
                          Output Tokens{getSortIndicator('output_tokens', usageSortConfig)}
                        </th>
                        <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleUsageSort('total_tokens')}>
                          Total Tokens{getSortIndicator('total_tokens', usageSortConfig)}
                        </th>
                        <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleUsageSort('request_count')}>
                          Requests{getSortIndicator('request_count', usageSortConfig)}
                        </th>
                        <th className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-surface-tertiary" onClick={() => handleUsageSort('total_cost')}>
                          Total Cost{getSortIndicator('total_cost', usageSortConfig)}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sortData(tokenUsage.filter(item => item.aggregation_key?.startsWith('tenant:')), usageSortConfig).map((item) => {
                        const inputTokens = Number(item.input_tokens) || 0;
                        const outputTokens = Number(item.output_tokens) || 0;
                        const totalCost = Number(item.total_cost) || ((inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000));
                        return (
                          <tr key={item.aggregation_key} className="hover:bg-surface-secondary">
                            <td className="px-4 py-3 font-medium">{item.tenant_id}</td>
                            <td className="px-4 py-3">{inputTokens.toLocaleString()}</td>
                            <td className="px-4 py-3">{outputTokens.toLocaleString()}</td>
                            <td className="px-4 py-3 font-medium">{Number(item.total_tokens || 0).toLocaleString()}</td>
                            <td className="px-4 py-3">{Number(item.request_count) || 0}</td>
                            <td className="px-4 py-3 font-mono font-medium">${totalCost.toFixed(6)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Cost Summary */}
                <div className="rounded-xl bg-success-soft p-6">
                  <h3 className="font-semibold mb-4">💰 Cost Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted">Total Cost (All Tenants)</p>
                      <p className="text-3xl font-bold font-mono">
                        ${tokenUsage.filter(item => item.aggregation_key?.startsWith('tenant:')).reduce((sum, item) => {
                          const inputTokens = Number(item.input_tokens) || 0;
                          const outputTokens = Number(item.output_tokens) || 0;
                          return sum + (Number(item.total_cost) || ((inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000)));
                        }, 0).toFixed(6)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted">Pricing</p>
                      <p className="text-sm font-mono">Input: $0.003/1K tokens | Output: $0.015/1K tokens</p>
                    </div>
                  </div>
                </div>

                {/* Cost Chart */}
                <div className="rounded-xl bg-surface-secondary p-6">
                  <h3 className="font-semibold mb-4">📊 Cost per Tenant</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={tokenUsage.filter(item => item.aggregation_key?.startsWith('tenant:')).map(item => {
                        const inputTokens = Number(item.input_tokens) || 0;
                        const outputTokens = Number(item.output_tokens) || 0;
                        const cost = Number(item.total_cost) || ((inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000));
                        return { tenant: item.tenant_id, cost: parseFloat(cost.toFixed(6)), requests: Number(item.request_count) || 0 };
                      }).sort((a, b) => b.cost - a.cost)}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="tenant" angle={-45} textAnchor="end" height={80} style={{ fontSize: '12px' }} />
                      <YAxis label={{ value: 'Cost ($)', angle: -90, position: 'insideLeft' }} style={{ fontSize: '12px' }} />
                      <Tooltip formatter={(value, name) => name === 'cost' ? [`$${value}`, 'Total Cost'] : [value, name]} />
                      <Legend />
                      <Bar dataKey="cost" name="Total Cost" fill="var(--color-accent)">
                        {tokenUsage.filter(item => item.aggregation_key?.startsWith('tenant:')).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={`hsl(${250 + index * 30}, 70%, 60%)`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Footer */}
        <footer className="text-center py-6 text-sm text-muted">
          Powered by AWS Bedrock Agent Core
        </footer>
      </main>

      {/* Deploy Agent Modal */}
      <Modal.Backdrop isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Deploy New Agent</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <TextField className="w-full" onChange={setTenantId}>
                <Label>Tenant ID</Label>
                <Input placeholder="e.g., tenant-123" value={tenantId} disabled={deployLoading} />
              </TextField>

              <Button variant="secondary" onPress={() => setShowAdvancedConfig(!showAdvancedConfig)}>
                {showAdvancedConfig ? '▼ Hide' : '▶ Show'} Advanced Configuration
              </Button>

              {showAdvancedConfig && (
                <div className="space-y-4 rounded-lg bg-surface-secondary p-4">
                  <Select
                    className="w-full"
                    value={agentConfig.modelId}
                    onChange={(key) => setAgentConfig({ ...agentConfig, modelId: key })}
                  >
                    <Label>Model ID</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="us.anthropic.claude-opus-4-5-20251101-v1:0" textValue="Claude Opus 4.5">Claude Opus 4.5<ListBox.ItemIndicator /></ListBox.Item>
                        <ListBox.Item id="us.anthropic.claude-sonnet-4-5-20250929-v1:0" textValue="Claude Sonnet 4.5">Claude Sonnet 4.5<ListBox.ItemIndicator /></ListBox.Item>
                        <ListBox.Item id="us.anthropic.claude-haiku-4-5-20251001-v1:0" textValue="Claude Haiku 4.5">Claude Haiku 4.5<ListBox.ItemIndicator /></ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <TextField className="w-full" onChange={(val) => setAgentConfig({ ...agentConfig, systemPrompt: val })}>
                    <Label>System Prompt</Label>
                    <TextArea placeholder="You are a helpful AI assistant." rows={3} value={agentConfig.systemPrompt} disabled={deployLoading} />
                  </TextField>

                  <Checkbox isSelected={useCustomTemplate} onChange={setUseCustomTemplate} isDisabled={deployLoading}>
                    <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                    <Label>Use Custom Template from GitHub</Label>
                  </Checkbox>

                  {useCustomTemplate && (
                    <div className="space-y-4 rounded-lg bg-surface p-4">
                      <TextField className="w-full" onChange={(val) => { setTemplateConfig({ ...templateConfig, repo: val }); setToolsRepo(val); }}>
                        <Label>GitHub Repository (owner/repo)</Label>
                        <Input placeholder="e.g., your-org/agent-templates" value={templateConfig.repo} disabled={deployLoading} />
                      </TextField>

                      <TextField className="w-full" onChange={(val) => setTemplateConfig({ ...templateConfig, path: val })}>
                        <Label>File Path</Label>
                        <Input placeholder="e.g., templates/main.py" value={templateConfig.path} disabled={deployLoading} />
                      </TextField>

                      <TextField className="w-full" onChange={(val) => setTemplateConfig({ ...templateConfig, branch: val })}>
                        <Label>Branch</Label>
                        <Input placeholder="main" value={templateConfig.branch} disabled={deployLoading} />
                      </TextField>

                      <TextField className="w-full" onChange={(val) => setTemplateConfig({ ...templateConfig, token: val })}>
                        <Label>GitHub Token (optional)</Label>
                        <Input type="password" placeholder="ghp_xxxxxxxxxxxx" value={templateConfig.token} disabled={deployLoading} />
                        <Description>Leave empty for public repositories</Description>
                      </TextField>

                      {/* Tools Section */}
                      <div className="border-t border-border pt-4 mt-4">
                        <h4 className="font-semibold mb-3">🛠️ Select Tools for Agent</h4>
                        <Button variant="secondary" onPress={fetchToolCatalog} isDisabled={!toolsRepo || loadingTools || deployLoading} isPending={loadingTools}>
                          {({ isPending }) => isPending ? <><Spinner size="sm" color="current" /> Loading...</> : 'Load Available Tools'}
                        </Button>

                        {availableTools.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                            {availableTools.map((tool) => {
                              const isSelected = selectedTools.some(t => t.id === tool.id);
                              return (
                                <div
                                  key={tool.id}
                                  className={`relative p-4 rounded-lg border-2 cursor-pointer transition-colors ${isSelected ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent'}`}
                                  onClick={() => !deployLoading && toggleToolSelection(tool)}
                                >
                                  <div className="flex gap-3">
                                    <span className="text-2xl">🔧</span>
                                    <div className="flex-1">
                                      <p className="font-medium">{tool.name}</p>
                                      <p className="text-sm text-muted">{tool.description}</p>
                                      <p className="text-xs text-muted mt-1">{tool.category}</p>
                                    </div>
                                  </div>
                                  {isSelected && <div className="absolute -top-2 -right-2 bg-accent text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">✓</div>}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {selectedTools.length > 0 && (
                          <div className="mt-4 p-4 rounded-lg bg-success-soft">
                            <p className="font-medium mb-2">Selected Tools ({selectedTools.length}):</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedTools.map(tool => (
                                <Chip key={tool.id} color="success">🔧 {tool.name}</Chip>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {deploymentStatus && (
                <div className={`p-4 rounded-lg ${deploymentStatus.includes('Error') ? 'bg-danger-soft' : 'bg-success-soft'}`}>
                  {deploymentStatus}
                </div>
              )}

              {deployedAgent && (
                <div className="p-4 rounded-lg bg-surface-secondary">
                  <h3 className="font-semibold mb-2">Deployed Agent Details</h3>
                  <p className="text-sm"><span className="font-medium">Tenant ID:</span> {deployedAgent.tenantId}</p>
                  {deployedAgent.status === 'deploying' ? (
                    <div className="mt-2">
                      <p className="text-sm flex items-center gap-2"><Spinner size="sm" /> Deploying in background...</p>
                      <p className="text-xs text-muted mt-1">Agent details will be available once deployment completes</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm"><span className="font-medium">Agent Name:</span> {deployedAgent.agentName || 'N/A'}</p>
                      <p className="text-sm"><span className="font-medium">Agent ID:</span> {deployedAgent.agentRuntimeId || 'N/A'}</p>
                      <p className="text-sm"><span className="font-medium">Endpoint:</span> <code className="text-xs bg-surface-tertiary px-2 py-1 rounded">{deployedAgent.agentEndpointUrl || 'N/A'}</code></p>
                      {deployedAgent.deployedAt && <p className="text-sm"><span className="font-medium">Deployed At:</span> {new Date(deployedAgent.deployedAt).toLocaleString()}</p>}
                    </>
                  )}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" slot="close" isDisabled={deployLoading}>Cancel</Button>
              <Button onPress={deployAgent} isDisabled={deployLoading} isPending={deployLoading} variant="primary">
                {({ isPending }) => isPending ? <><Spinner size="sm" color="current" /> Deploying...</> : 'Deploy Agent'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

export default App;
