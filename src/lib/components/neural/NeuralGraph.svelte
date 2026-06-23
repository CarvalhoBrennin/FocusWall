<script>
  import { formatMessage, msg, t } from '../../i18n/index.js';

  let { graph = { nodes: [], edges: [] }, onSelect = () => {}, onCreateMissing = () => {} } = $props();

  const width = 640;
  const height = 300;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 104;

  const positionedNodes = $derived((graph.nodes || []).map((node, index, list) => {
    if (node.active || list.length === 1) {
      return { ...node, x: cx, y: cy };
    }
    const satellites = list.filter((item) => !item.active);
    const satelliteIndex = satellites.findIndex((item) => item.id === node.id);
    const angle = ((Math.PI * 2) / Math.max(1, satellites.length)) * satelliteIndex - Math.PI / 2;
    const localRadius = radius + Math.min(46, Math.max(0, satellites.length - 4) * 7);
    return {
      ...node,
      x: cx + Math.cos(angle) * localRadius,
      y: cy + Math.sin(angle) * localRadius
    };
  }));

  const positionedEdges = $derived((graph.edges || []).map((edge) => {
    const source = positionedNodes.find((node) => node.id === edge.sourceId);
    const target = positionedNodes.find((node) => node.id === edge.targetId);
    if (!source || !target) return null;
    return { ...edge, source, target };
  }).filter(Boolean));

  function handleNodeAction(node) {
    if (node.missing) {
      onCreateMissing(node.title);
      return;
    }
    onSelect(node.id);
  }

  function formatNodeTitle(title) {
    const value = String(title || msg('neural.graph.untitled'));
    return value.length > 24 ? `${value.slice(0, 21)}...` : value;
  }

  function nodeAriaLabel(node) {
    if (node.missing) {
      return formatMessage(msg('neural.graph.createNote'), { title: node.title });
    }
    return formatMessage(msg('neural.graph.openNote'), { title: node.title });
  }
</script>

<div class="neural-graph-card" aria-label={$t('neural.graph.label')}>
  {#if !positionedNodes.length}
    <p class="neural-muted">{$t('neural.graph.empty')}</p>
  {:else if positionedNodes.length === 1}
    <div class="neural-empty-graph">
      <span>{positionedNodes[0].title}</span>
      <p>{$t('neural.graph.noConnections')}</p>
    </div>
  {:else}
    <svg class="neural-graph" viewBox="0 0 {width} {height}" role="img" aria-label={$t('neural.graph.label')}>
      {#each positionedEdges as edge (`${edge.sourceId}-${edge.targetId}`)}
        <line
          class="neural-edge"
          class:is-missing={edge.target.missing || edge.source.missing}
          x1={edge.source.x}
          y1={edge.source.y}
          x2={edge.target.x}
          y2={edge.target.y}
        />
      {/each}

      {#each positionedNodes as node (node.id)}
        <g
          class="neural-node"
          class:is-active={node.active}
          class:is-missing={node.missing}
          transform="translate({node.x}, {node.y})"
          role="button"
          tabindex="0"
          aria-label={nodeAriaLabel(node)}
          onclick={() => handleNodeAction(node)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleNodeAction(node);
            }
          }}
        >
          <circle r={node.active ? 30 : Math.min(24, 14 + node.degree * 2)} />
          <text y={node.active ? 48 : 38} text-anchor="middle">{formatNodeTitle(node.title)}</text>
        </g>
      {/each}
    </svg>
  {/if}
</div>
