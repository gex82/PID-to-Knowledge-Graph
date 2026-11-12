from pidkg.build import build_graph
from pidkg.models import PageExtraction


def test_source_ambiguity_notes_survive_graph_build():
    page = PageExtraction.model_validate({
        'page': 1, 'equipment': [{'id': 'T', 'kind': 'tank', 'notes': 'Tank tag incomplete.'}],
        'instruments': [{'id': 'I', 'function': 'LI', 'notes': 'Only area printed.',
                         'measures': {'item': 'T'}}],
        'boundaries': [{'id': 'B', 'name': 'Outlet', 'direction': 'sink', 'notes': 'No drawing reference.'}],
        'lines': [{'id': 'L', 'from': 'T', 'to': 'B', 'notes': 'Direction inferred.', 'flow_direction': 'inferred'}],
        'signals': [{'from': 'I', 'to': 'T', 'purpose': 'control', 'notes': 'Wire shown; logic absent.'}]
    })
    kg = build_graph([page], 'test', 'Test')
    nodes = {n.id: n for n in kg.nodes}
    assert nodes['P01.T'].attributes['notes'] == 'Tank tag incomplete.'
    assert nodes['P01.I'].attributes['notes'] == 'Only area printed.'
    assert nodes['P01.I'].tag is None
    assert not nodes['P01.I'].attributes.get('loop_key')
    assert nodes['P01.L.1'].attributes['flow_direction'] == 'inferred'
    assert nodes['P01.L.1'].attributes['notes'] == 'Direction inferred.'
    assert next(e for e in kg.edges if e.type == 'SIGNAL_TO').attributes['notes'] == 'Wire shown; logic absent.'


def test_off_page_confidence_respects_incoming_evidence():
    a = PageExtraction.model_validate({'page': 1, 'sheet': {'drawing_number':'P1'},
        'off_page_connectors':[{'id':'O','direction':'out','other_drawing':'P2','confidence':.95}]})
    b = PageExtraction.model_validate({'page': 2, 'sheet': {'drawing_number':'P2'},
        'off_page_connectors':[{'id':'I','direction':'in','other_drawing':'P1','confidence':.55}]})
    kg = build_graph([a,b], 'test','Test')
    assert next(e for e in kg.edges if e.attributes.get('off_page')).confidence == .55


def test_explicit_panel_tag_scope_prevents_unrelated_display_merge():
    pages = [PageExtraction.model_validate({'page': p, 'sheet': {'drawing_number': f'P{p}'},
        'instruments':[{'id':'I','tag':'LI 001','location':'scada',
                        'attributes':{'tag_scope':'sheet'}}]}) for p in (1,2)]
    kg = build_graph(pages, 'test','Test')
    assert {n.id for n in kg.nodes if n.type == 'Instrument'} == {'LI-001@P-1','LI-001@P-2'}


def test_signal_only_flags_do_not_create_fluid_paths():
    pages = [PageExtraction.model_validate({'page':p,'sheet':{'drawing_number':f'P{p}'},
        'off_page_connectors':[{'id':'O','direction':'out' if p==1 else 'in',
        'other_drawing':f'P{3-p}','attributes':{'connection_type':'signal'}}]}) for p in (1,2)]
    kg = build_graph(pages,'test','Test')
    assert not [e for e in kg.edges if e.type == 'FLOWS_TO']
    assert [(e.source,e.target) for e in kg.edges if e.type == 'SIGNAL_TO'] == [('P01.O','P02.O')]


def test_measurement_wire_to_panel_is_not_an_actuation():
    p = PageExtraction.model_validate({'page':1,
        'equipment':[{'id':'VCP','kind':'other'}],
        'instruments':[{'id':'LT','tag':'LT-101'}],
        'signals':[{'from':'LT','to':'VCP','purpose':'measurement'}]})
    kg = build_graph([p],'test','Test')
    assert not [e for e in kg.edges if e.type == 'ACTUATES']


def test_reviewed_one_sided_reference_has_evidence_and_no_unmatched_warning():
    pages = [PageExtraction.model_validate({'page':1, 'sheet':{'drawing_number':'P1'},
        'boundaries':[{'id':'B','name':'To plant','direction':'sink'}]}),
        PageExtraction.model_validate({'page':2,'sheet':{'drawing_number':'P2'},
        'off_page_connectors':[{'id':'O','direction':'in','other_drawing':'P1'}]})]
    link = {'source':{'page':1,'id':'B'},'target':{'page':2,'id':'O'},
            'confidence':.8,'evidence':'Reciprocal source and destination labels visually checked.'}
    kg = build_graph(pages,'test','Test',reviewed_links=[link])
    bridge = next(e for e in kg.edges if e.attributes.get('reviewed'))
    assert bridge.type == 'FLOWS_TO' and bridge.confidence == .8
    assert bridge.attributes['evidence'] == link['evidence']
    assert not [i for i in kg.issues if i['code']=='unmatched_off_page']
    link['target']['id']='missing'
    bad = build_graph(pages,'test','Test',reviewed_links=[link])
    assert any(i['severity']=='error' and i['code']=='invalid_reviewed_link' for i in bad.issues)
