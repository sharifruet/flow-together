drop table if exists ACT_FO_FORM_INSTANCE cascade constraints;
drop table if exists ACT_FO_FORM_DEFINITION cascade constraints;
drop table if exists ACT_FO_FORM_RESOURCE cascade constraints;
drop table if exists ACT_FO_FORM_DEPLOYMENT cascade constraints;

drop index if exists ACT_IDX_FORM_RSRC_DPL;
drop index if exists ACT_IDX_FORM_DEF_UNIQ;
drop index if exists ACT_IDX_FORM_TASK;
drop index if exists ACT_IDX_FORM_PROC;
drop index if exists ACT_IDX_FORM_SCOPE;
