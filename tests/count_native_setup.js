/***********************************************************************
 *          count_native_setup.js
 *
 *      The setup of the vitest project of the counting tests
 *      (vite.config.js): every native is wrapped before src/ loads, so
 *      what src/ keeps in a const at load is wrapped too.
 *
 *          Copyright (c) 2026, ArtGins.
 *          All Rights Reserved.
 ***********************************************************************/
import { install_native_work_counting } from "./count_native_work.js";

install_native_work_counting();
