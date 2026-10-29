/* Local editor checkpoints and optimistic stale-editor detection; no database objects. */
(function() {
    const clone=v=>JSON.parse(JSON.stringify(v));
    const workflow={savedData:null,headId:null,publishedId:null,draftId:null,formDirty:false,uncertain:false};
    function label(id,row,fallback) { const el=document.getElementById(id);if(el)el.textContent=row ? '#'+row.id+' · '+new Date(row.published_at||row.created_at).toLocaleString() : fallback; }
    workflow.loaded=function(row,published,draft) {
        this.savedData=clone(row?.map_data||{type:'FeatureCollection',features:[]});
        this.headId=row?.id??null;this.publishedId=published?.id??null;this.draftId=draft?.id??null;this.formDirty=false;this.uncertain=false;
        label('last-published',published,'Not published');label('last-saved-draft',draft,'No saved draft');
    };
    workflow.hasUnsaved=function(){return this.formDirty||window.adminMapData.hasChanges||!this.savedData||JSON.stringify(adminBuildFeatureCollection())!==JSON.stringify(this.savedData)};
    workflow.applied=function(){this.formDirty=false;};
    workflow.discard=function(ask=true){
        if(window.app.state.mapSaveInFlight||window.app.state.mapLoadInFlight){window.app.helpers.showToast('Wait for the current request to finish.');return false;}
        if(this.uncertain){window.app.helpers.showToast('The previous save outcome is uncertain. Reload to reconcile before editing.');return false;}
        if(!this.savedData){window.app.helpers.showToast('Load a saved map before discarding.');return false;}
        if(ask&&this.hasUnsaved()&&!window.confirm('Discard all unsaved map changes and return to the last saved state?'))return false;
        const layer=window.adminMapData.selectedLayer;if(layer?.dragging?.enabled())layer.dragging.disable();if(layer?.pm?.layerDragEnabled?.())layer.pm.disableLayerDrag();
        adminRenderMapData(clone(this.savedData));window.adminMapData.changeRevision++;window.adminMapData.hasChanges=false;window.app.state.unpublishedChanges=0;this.formDirty=false;
        const count=document.getElementById('unpublished-count');if(count){count.textContent='0';count.hidden=true;}
        for(const id of ['point-editor','route-editor']){const el=document.getElementById(id);if(el)el.style.display='none';}document.getElementById('workspace')?.classList.remove('editor-open');
        window.app.helpers.showToast('Unsaved changes discarded. The saved draft and public map were not changed.');return true;
    };
    workflow.checkHead=async function(client,projectId){
        if(this.uncertain)throw new Error('Previous save outcome is uncertain. Reload to reconcile before saving.');
        const result=await client.from('map_versions').select('id,status,published_at,created_at').eq('project_id',projectId).order('id',{ascending:false}).limit(1).maybeSingle();
        if(result.error)throw result.error;
        if(String(result.data?.id??'')!==String(this.headId??''))throw new Error('Another editor saved a newer version. Keep your changes locally or reload before saving.');
    };
    workflow.saved=function(row,data){
        this.savedData=clone(data);this.headId=row.id;
        if(row.status==='draft'){this.draftId=row.id;label('last-saved-draft',row,'No saved draft');}
        else {this.publishedId=row.id;label('last-published',row,'Not published');}
    };
    function acceptanceMode(){if(!window.appConfig.ownerAcceptanceReadOnly)return;for(const button of document.querySelectorAll('[data-action="saveDraft"],[data-action="publishMap"]')){button.disabled=true;button.title='Read-only owner acceptance preview';}const feedback=document.getElementById('editor-feedback');if(feedback)feedback.textContent='Read-only owner acceptance preview. No real route writes are permitted.';}
    document.addEventListener('projectchange',acceptanceMode);
    window.adminWorkflow=workflow;
    document.addEventListener('DOMContentLoaded',function(){
        acceptanceMode();
        for(const id of ['point-editor','route-editor']){const el=document.getElementById(id);if(el)for(const type of ['input','change'])el.addEventListener(type,function(event){if(event.target.matches('input,select,textarea'))workflow.formDirty=true;});}
    });
    document.addEventListener('adminsessionended',()=>{workflow.savedData=null;workflow.headId=null;workflow.formDirty=false;workflow.uncertain=false;});
    window.app.registerActionGroup('editorWorkflow',{discardChanges:()=>workflow.discard()});
})();
